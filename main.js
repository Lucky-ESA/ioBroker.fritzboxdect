'use strict';

/*
 * Created with @iobroker/create-adapter v2.0.1
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const options = {
    explicitArray: false,
    mergeAttrs: true
};
const utils      = require('@iobroker/adapter-core');
const axios      = require("axios");
const crypto     = require("crypto");
const xml2js     = require('xml2js');
const parser     = new xml2js.Parser(options);
const qs         = require("qs");
const encodeurl  = require("encodeurl");
const createDP   = require("./lib/createDP");
const updateDP   = require("./lib/updateDP");
const fs         = require('fs');
const https      = require('https');
const httpsAgent = new https.Agent({
    rejectUnauthorized: false
//    cert: fs.readFileSync('./lib/boxcert.cer'),
//    key: fs.readFileSync('client.key'),
//    ca: fs.readFileSync('./lib/boxcert.cer'),
});
class Fritzboxdect extends utils.Adapter {

    /**
     * @param {Partial<utils.AdapterOptions>} [options={}]
     */
    constructor(options) {
        super({
            ...options,
            name: 'fritzboxdect',
        });
        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    async onReady() {
        // Initialize your adapter here
        this.setState("info.connection", false, true);
        this.requestClient = axios.create();
        this.strcheck      = null;
        this.start         = null;
        this.createDP      = new createDP(this);
        this.updateDP      = new updateDP(this);
        this.xmlvalue      = {sid: 'start',  challenge: '', blocktime: '', pbkf2: '', homeauto: false };

        if (this.config.password === null || this.config.password === undefined) {
            this.log.error("Password is not set!!");
            return;
        }

        if (this.config.username === null || this.config.username === undefined) {
            this.log.error("Username is not set!!");
            return;
        }

        if (this.config.ip === null || this.config.ip === undefined) {
            this.log.error("IP is not set!!");
            return;
        }

        this.Headers =  { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' };
        this.name = { username: this.config.username };
        this.config.ip = this.config.ip.replace("http://", "").replace("https://", "");

        if (this.config.ssl) {
            this.config.ip = 'https://' + this.config.ip
            this.requestClient = axios.create({ httpsAgent });
        } else {
            this.config.ip = 'http://' + this.config.ip
        }

        this.subscribeStates('*');
        await this.DECT_Control();
        await this.Fritzbox("start", this.name);
        this.updateInterval = setInterval(async () => {
            this.start = null;
        }, this.config.dect_int * 60 * 1000);
    }

    /**
     * DECT_Control!
     * Create control datapoints
     */
    async DECT_Control() {
        await this.setObjectNotExistsAsync('DECT_Control', {
            type: "channel",
            common: {
                name: "DECT Control",
                role: "state",
            },
            native: {},
        });

        await this.setObjectNotExists('DECT_Control.startulesubscription', {
            type: "state",
            common: {
                name: "startulesubscription",
                type: "boolean",
                role: "button",
                write: true,
                read: true,
            },
            native: {},
        })

        await this.setObjectNotExists('DECT_Control.sendorder', {
            type: "state",
            common: {
                name: "e. g. switchcmd=setsimpleonoff&ain=130770012360",
                type: "string",
                role: "value",
                write: true,
                read: true,
            },
            native: {},
        })
    }

    /**
     * Fritzbox!
     * Login, send and check sid Fritzbox
     * @param for switch
     * @param post param
     * @param send param
     */
    async Fritzbox(check, sendpost, sendvalue) {
        const resid = await this.requestClient
            .post(this.config.ip + '/login_sid.lua?version=2', qs.stringify(sendpost), this.Headers)
            .then((res) => res.data)
            .catch((error) => {
                this.log.error(error);
            });
        if (resid) {
            try {
                parser.parseString(resid, async (err, result) => {
                    let hashsid = null;
                    const home = (resid.includes('HomeAuto')) ? true : false;
                    const pbkf2 = (result.SessionInfo.Challenge.indexOf("2$") === 0) ? true : false
                    this.xmlvalue = {sid: result.SessionInfo.SID,  challenge: result.SessionInfo.Challenge, blocktime: result.SessionInfo.BlockTime, pbkf2: pbkf2, homeauto: home  };
                    switch (check) {
                        case "start":
                            this.log.info("Start Adapter.");
                            if (result.SessionInfo.SID === "0000000000000000") {
                                if (this.xmlvalue.pbkf2) {
                                    hashsid = await this.create_pbkdf2(this.xmlvalue.challenge, this.config.password);
                                } else {
                                    hashsid = await this.create_md5(this.xmlvalue.challenge, this.config.password);
                                }
                                hashsid = { username: this.config.username, response: hashsid };
                                if (this.xmlvalue.blocktime > 0) await this.sleep(this.xmlvalue.blocktime * 1000)
                                this.Fritzbox("login", hashsid, sendvalue);
                            } else {
                                this.log.info("Can't find the fritzbox! " + err);
                            }
                            break;
                        case "login":
                            this.log.info("Login");
                            if (result.SessionInfo.SID === "0000000000000000") {
                                this.log.info("Login ivalid! Wrong username or password!");
                                this.setState("info.connection", false, true);
                            } else {
                                this.log.info("Login success with SID: " + this.xmlvalue.sid);
                                if (this.xmlvalue.homeauto === false) {
                                    this.log.error("User does not have access to DECT Devices!!");
                                    this.setState("info.connection", false, true);
                                    return;
                                }
                                this.setState("info.connection", true, true);
                                if (sendvalue !== undefined) {
                                    this.Fritzboxsend(sendvalue);
                                } else {
                                    this.Fritzboxdevice();
                                    this.Fritzboxtemplates();
                                    this.updateTemplateInterval = setInterval(async () => {
                                        this.Fritzboxtemplates();
                                    }, this.config.temp_int * 60 * 60 * 1000);
                                }
                            }
                            break;
                        case "check":
                            if (result.SessionInfo.SID === this.xmlvalue.sid) {
                                this.log.debug("SID is valid");
                                this.Fritzboxdevice();
                            } else {
                                if (this.xmlvalue.blocktime > 0) await this.sleep(this.xmlvalue.blocktime * 1000)
                                this.Fritzbox("start", this.name);
                            }
                            break;
                        case "send":
                            if (result.SessionInfo.SID === this.xmlvalue.sid) {
                                this.log.debug("SID is valid for send order");
                                this.Fritzboxsend(sendvalue);
                            } else {
                                if (this.xmlvalue.blocktime > 0) await this.sleep(this.xmlvalue.blocktime * 1000)
                                this.Fritzbox("start", this.name, sendvalue);
                            }
                            break;
                        case "logout":
                            if (result.SessionInfo.SID === "0000000000000000") {
                                this.log.info("Logout successfully!");
                            } else {
                                this.log.info("Logout not successfully!");
                            }
                            break;
                        default:
                            this.log.error("Command " + check + " not found");
                            break;
                    }
                });
            } catch (e) {
                this.log.error('Parse error: ' + e);
            }
        } else {
            this.log.error('Fritzbox does not answer!');
        }
    }

    /**
     * createFolder!
     * @param ident Folder ID
     * @param name Foldername
     */
    createFolder(ident, name) {
        return new Promise(resolve => {
            this.getForeignObject(this.namespace + '.' + ident, async (err, obj) => {
                this.setObjectNotExistsAsync(ident, {
                    type: "channel",
                    common: {
                        name: name,
                        write: false,
                        read: true,
                    },
                    native: {},
                })
                .then(() => {
                resolve(true);
                })
                .catch((error) => {
                    this.log.error(error);
                });
            });
        });
    }

    /**
     * createDataPoint!
     * @param ident DataPoint ID
     * @param name DataPoint Name
     */
    createDataPoint(ident, name, role, type, write) {
        return new Promise(resolve => {
            this.getForeignObject(this.namespace + '.' + ident, async (err, obj) => {
                this.setObjectNotExistsAsync(ident, {
                    type: "state",
                    common: {
                        name: name,
                        role: role,
                        type: type,
                        write: write,
                        read: true,
                    },
                    native: {},
                })
                .then(() => {
                resolve(true);
                })
                .catch((error) => {
                    this.log.error(error);
                });
            });
        });
    }

    /**
     * insertValue!
     * @param ident DataPoint ID
     * @param value
     */
    insertValue(ident, value) {
        return new Promise(resolve => {
            this.getForeignObject(this.namespace + '.' + ident, async (err, obj) => {
                this.setStateAsync(ident, {
                    val: value,
                    ack: true
                });
            });
        });
    }

    /**
     * Fritzboxtemplates!
     * create and update Template devices
     */
    async Fritzboxtemplates() {
        if (this.xmlvalue.sid === "0000000000000000") {
            this.setState("info.connection", false, true);
            this.log.error("Missing SID!! - Fritzboxtemplates: " + this.xmlvalue.sid);
            return;
        }
        const resid = await this.requestClient
            .get(this.config.ip + '/webservices/homeautoswitch.lua?switchcmd=gettemplatelistinfos&sid=' + this.xmlvalue.sid)
            .then((res) => res.data)
            .catch((error) => {
                this.log.error("GET Fritzboxtemplates: " + error);
            });
        if (resid === undefined) {
            this.log.error('Update Template: Fritzbox not available. Restart over Fritzboxdevice');
            return;
        }
        let dectdata = resid.toString("utf-8").trim().replace(/\applymask=/g, 'mask=');
        let dpname  = null;
        let ident   = null;
        let devids  = null;
        let db  = null;
        let maskids = null;
        this.log.debug(JSON.stringify(dectdata));
        if (this.isXMLString(dectdata) && (dectdata !== null || dectdata !== undefined)) {
            try {
                parser.parseString(dectdata, async (err, result) => {
                    if (result.templatelist.template.identifier !== undefined) {
                        this.log.debug("Single: " + JSON.stringify(result.templatelist.template));
                        ident = result.templatelist.template.identifier.replace(/\s/g, '').replace(/\-1/g, '');
                        dpname = result.templatelist.template.name;
                        await this.createFolder('TEMP_' + ident, dpname);
                        await this.createDataPoint('TEMP_' + ident + '.toogle', 'Toogle aktivieren/deaktivieren', 'button', 'boolean', true);
                        Object.keys(result.templatelist.template).forEach( async (key) => {
                            if (key === "devices") {
                                Object.keys(result.templatelist.template[key]).forEach( async (dev) => {
                                    if (dev === "device") {
                                        if (result.templatelist.template[key][dev].identifier !== undefined) {
                                            devids = result.templatelist.template[key][dev].identifier;
                                        } else {
                                            Object.keys(result.templatelist.template[key][dev]).forEach( async (devid) => {
                                                if (devids === null) {
                                                    devids = result.templatelist.template[key][dev][devid].identifier;
                                                } else {
                                                    devids += ", " + result.templatelist.template[key][dev][devid].identifier;
                                                }
                                            });
                                        }
                                    }
                                });
                                result.templatelist.template[key] = devids;
                            } else if (key === "applymask") {
                                Object.keys(result.templatelist.template[key]).forEach( async (mask) => {
                                    if (maskids === null) {
                                        maskids = mask;
                                    } else {
                                        maskids += ", " + mask;
                                    }
                                });
                                result.templatelist.template[key] = maskids;
                            }
                            await this.createDataPoint('TEMP_' + ident + '.' + key, key, 'info', typeof result.templatelist.template[key], false);
                            this.getForeignObject(this.namespace + '.TEMP_' + ident + '.' + key, async (err, obj) => {
                                if (obj) {
                                    this.setStateAsync('TEMP_' + ident + '.' + key, {
                                        val: result.templatelist.template[key],
                                        ack: true
                                    });
                                }
                            });
                        });
                    } else {
                        Object.keys(result.templatelist.template).forEach(async (n) => {
                            this.log.debug("Multi: " + JSON.stringify(result.templatelist.template[n]));
                            maskids = null;
                            devids = null;
                            dpname = result.templatelist.template[n].name;
                            ident = result.templatelist.template[n].identifier.replace(/\s/g, '').replace(/\-1/g, '');
                            dpname = result.templatelist.template[n].name;
                            db = this.createFolder('TEMP_' + ident, dpname);
                            db = this.createDataPoint('TEMP_' + ident + '.toogle', 'Toogle aktivieren/deaktivieren', 'button', 'boolean', true);
                            Object.keys(result.templatelist.template[n]).forEach( async (key) => {
                                if (key === "devices") {
                                    Object.keys(result.templatelist.template[n][key]).forEach( async (dev) => {
                                        if (dev === "device") {
                                            if (result.templatelist.template[n][key][dev].identifier !== undefined) {
                                                devids = result.templatelist.template[n][key][dev].identifier;
                                            } else {
                                                Object.keys(result.templatelist.template[n][key][dev]).forEach( async (devid) => {
                                                    if (devids === null) {
                                                        devids = result.templatelist.template[n][key][dev][devid].identifier;
                                                    } else {
                                                        devids += ", " + result.templatelist.template[n][key][dev][devid].identifier;
                                                    }
                                                });
                                            }
                                        }
                                    });
                                    result.templatelist.template[n][key] = devids;
                                } else if (key === "applymask") {
                                    Object.keys(result.templatelist.template[n][key]).forEach( async (mask) => {
                                        if (maskids === null) {
                                            maskids = mask;
                                        } else {
                                            maskids += ", " + mask;
                                        }
                                    });
                                    result.templatelist.template[n][key] = maskids;
                                }
                                db = this.createDataPoint('TEMP_' + ident + '.' + key, key, 'info', typeof result.templatelist.template[n][key], false);
                                db = this.insertValue('TEMP_' + ident + '.' + key, result.templatelist.template[n][key])
                            });
                        });
                    }
                });
            } catch (e) {
                this.log.error('Parse error: ' + e);
            }
        }
    }

    /**
     * Fritzboxdevice!
     * create and update DECT devices
     */
    async Fritzboxdevice() {
        if (this.xmlvalue.sid === "0000000000000000") {
            this.setState("info.connection", false, true);
            this.log.error("Missing SID!! - Fritzboxdevice: " + this.xmlvalue.sid);
            this.Fritzbox("start", this.name);
            return;
        }
        const resid = await this.requestClient
            .get(this.config.ip + '/webservices/homeautoswitch.lua?switchcmd=getdevicelistinfos&sid=' + this.xmlvalue.sid)
            .then((res) => res)
            .catch((error) => {
                this.log.error("GET Fritzboxdevice: " + error);
            });

        if (resid.status !== 200) {
            this.log.error('Fritzboxdevice: Response from Fritzbox: ' + resid.status);
            await this.sleep(10000);
            this.Fritzbox("start", this.name);
            return;
        } else if (resid.data === undefined) {
            this.log.error('Fritzboxdevice: Date from Fritzbox are undefined!!');
            await this.sleep(10000);
            this.Fritzbox("start", this.name);
            return;
        }

        let dectdata = resid.data.toString("utf-8").trim();
        let bitmask = null;
        let ident   = null;
        let fw_str  = null;
        let isblind = 0;
        if (dectdata.includes('<group')) dectdata = dectdata.replace(/\<group/g, '<device').replace(/\<\/group/g, '</device')
        this.log.debug(JSON.stringify(dectdata));
        if (this.isXMLString(dectdata) && (dectdata !== null || dectdata !== undefined)) {
            try {
                parser.parseString(dectdata, async (err, result) => {
                    dectdata = null;
                    if (result.devicelist.device !== undefined) {
                        if (this.start === null) {
                            this.start = 1;
                            this.strcheck = JSON.parse(JSON.stringify(result.devicelist));
                        } else {
                            this.start = 2;
                        }
                        if (result.devicelist.device.identifier !== undefined) {
                            bitmask = result.devicelist.device.functionbitmask;
                            if (bitmask === "1") {
                                fw_str = result.devicelist.device.fwversion;
                            } else {
                                isblind = 0;
                                if (bitmask === "335888") isblind = 1;
                                if (fw_str) {
                                    result.devicelist.device.fwversion = fw_str;
                                    fw_str = null;
                                }
                                ident = result.devicelist.device.identifier.replace(/\s/g, '').replace(/\-1/g, '');
                                if (this.start === 1) {
                                    this.createDP.parse(isblind, result.devicelist.device, 'DECT_' + ident, result.devicelist.device);
                                } else {
                                    this.updateDP.parse(isblind, this.strcheck.device, 'DECT_' + ident, result.devicelist.device);
                                }
                            }
                        } else {
                            Object.keys(result.devicelist.device).forEach((n) => {
                                bitmask = result.devicelist.device[n].functionbitmask;
                                if (bitmask === "1") {
                                    fw_str = result.devicelist.device[n].fwversion;
                                } else {
                                    isblind = 0;
                                    if (bitmask === "335888") isblind = 1;
                                    if (fw_str) {
                                        result.devicelist.device[n].fwversion = fw_str;
                                        fw_str = null;
                                    }
                                    ident = result.devicelist.device[n].identifier.replace(/\s/g, '').replace(/\-1/g, '');
                                    if (this.start === 1) {
                                        this.createDP.parse(isblind, result.devicelist.device[n], 'DECT_' + ident, result.devicelist.device[n]);
                                    } else {
                                        this.updateDP.parse(isblind, this.strcheck.device[n], 'DECT_' + ident, result.devicelist.device[n]);
                                    }
                                }
                            });
                        }
                        this.strcheck = JSON.parse(JSON.stringify(result.devicelist));
                        result = null;
                    }
                });
            } catch (e) {
                this.log.error('Parse error: ' + e);
            }
            if (this.start === 1) sleepT = 8000;
            await this.sleep(this.config.dect_int_sec * 1000);
            this.check = { username: this.config.username, sid: this.xmlvalue.sid };
            await this.Fritzbox("check", this.check);
//        this.logout = { logout: "logout", sid: this.xmlvalue.sid };
//        this.Fritzbox("logout", this.logout);
        }
    }

    /**
     * Fritzboxsend!
     * @param send param
     */
    async Fritzboxsend(sendvalue) {
        if (this.xmlvalue.sid === "0000000000000000") {
            this.setState("info.connection", false, true);
            this.log.error("Missing SID!! - Fritzboxsend: " + this.xmlvalue.sid);
            this.Fritzbox("start", this.name, sendvalue);
            return;
        }
        const resid = await this.requestClient
            .get(this.config.ip + '/webservices/homeautoswitch.lua?' + sendvalue + '&sid=' + this.xmlvalue.sid)
            .then((res) => res.data)
            .catch((error) => {
                this.log.error("GET SEND: " + error);
            });
        try {
            this.log.info("Send: " + resid); //Wenn 1 dann OK
        } catch (e) {
            this.log.error('Send error: ' + e);
        }
    }

    /**
     * isXMLString!
     * @param xml string
     */
    isXMLString(str) {
        try {
            parser.parseString(str);
        } catch (e) {
            return false;
        }
        return true;
    }

    /**
     * Sleep!
     * @param millisecond
     */
    sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    /**
     * Create pbkdf2 hash
     * @param challenge
     * @param password
     * def calculate_pbkdf2_response(challenge: str, password: str) -> str: 
     * """ Calculate the response for a given challenge via PBKDF2 """ 
     * challenge_parts = challenge.split("$") 
     * # Extract all necessary values encoded into the challenge 
     * iter1 = int(challenge_parts[1]) 
     * salt1 = bytes.fromhex(challenge_parts[2]) 
     * iter2 = int(challenge_parts[3]) 
     * salt2 = bytes.fromhex(challenge_parts[4]) 
     * # Hash twice, once with static salt... 
     * hash1 = hashlib.pbkdf2_hmac("sha256", password.encode(), salt1, iter1) 
     * # Once with dynamic salt. 
     * hash2 = hashlib.pbkdf2_hmac("sha256", hash1, salt2, iter2) 
     * return f"{challenge_parts[4]}${hash2.hex()}" 
     */
    create_pbkdf2(challenge, password) {
        const challenge_parts = challenge.split('$');
        const iter1 = Math.floor(challenge_parts[1]);
        const salt1 = Buffer.from(challenge_parts[2], 'hex');
        const iter2 = Math.floor(challenge_parts[3]);
        const salt2 = Buffer.from(challenge_parts[4], 'hex');
        const hash1 = crypto.pbkdf2Sync(password, salt1, iter1, 32, 'sha256');
        const hash2 = crypto.pbkdf2Sync(hash1, salt2, iter2, 32, 'sha256');
        return challenge_parts[4] + '$' + hash2.toString('hex');
    }

    /**
     * Create MD5 hash
     * @param challenge
     * @param password
     * def calculate_md5_response(challenge: str, password: str) -> str: 
     * """ Calculate the response for a challenge using legacy MD5 """ 
     * response = challenge + "-" + password 
     * # the legacy response needs utf_16_le encoding 
     * response = response.encode("utf_16_le") 
     * md5_sum = hashlib.md5() 
     * md5_sum.update(response) 
     * response = challenge + "-" + md5_sum.hexdigest() 
     * return response 
     */
    create_md5(challenge, password) {
        const md5_sum = crypto.createHash('md5').update(Buffer.from(challenge + '-' + password, 'utf16le')).digest('hex');
        const response = challenge + '-' + md5_sum;
        return response;
    }

    /**
     * Alexa RGB Colors
     * @param RGB
     */
    colors(rgb) {
        /**
        *    Blau       #0000ff
        *    Blauer
        *    Rot        #ff0000
        *    Roter
        *    Magenta    #ff00ff
        *    Gold#ffd500
        *    Silber#bfbfbf
        *    Purpur
        *    Lachs
        *    Orange     #ffa600
        *    Gelb       #ffff00
        *    Gelber
        *    Grün       #00ff00
        *    Grüner
        *    Türkis     #3fe0d0
        *    Himmelblau #87ceea
        *    Lila       #ed82ed
        *    Pink       #ffbfcc
        *    Rosa       #eebbcc
        *    Lavendel#c0a8e4
        */
        const colors = {
            "#ff0000"   : {"dect" : 358, "sat" : [180,112,54], "unm" : [255,255,255], "deb" : ["Rot","Rot hell","Rot heller"] },
            "#ffa600"   : {"dect" : 35,  "sat" : [214,140,72], "unm" : [252,252,255], "deb" : ["Orange","Orange hell","Orange heller"] }, /*orange*/
            "#ffff00"   : {"dect" : 52,  "sat" : [153,102,51], "unm" : [255,255,255], "deb" : ["Gelb","Gelb hell","Gelb heller"] }, /*yellow*/
            "#c7ff1f"   : {"dect" : 92,  "sat" : [123, 79,38], "unm" : [248,250,252], "deb" : ["Limette","Limette hell","Limette heller"] }, /*lime*/
            "#7efc00"   : {"dect" : 92,  "sat" : [123, 79,38], "unm" : [248,250,252], "deb" : ["Grasgrün","Grasgrün hell","Grasgrün heller"] }, /*grasgreen*/
            "#00ff00"   : {"dect" : 120, "sat" : [160, 82,38], "unm" : [220,232,242], "deb" : ["Grün","Grün hell","Grün heller"] }, /*green*/
            "#8eed8e"   : {"dect" : 160, "sat" : [145, 84,41], "unm" : [235,242,248], "deb" : ["Hellgrün","Hellgrün hell","Hellgrün heller"] }, /*lightgreen*/
            "#3fe0d0"   : {"dect" : 160, "sat" : [145, 84,41], "unm" : [235,242,248], "deb" : ["Türkis","Türkis hell","Türkis heller"] }, /*turpuoise*/
            "#333333"   : {"dect" : 195, "sat" : [179,118,59], "unm" : [255,255,255], "deb" : ["Cyan","Cyan hell","Cyan heller"] }, /*cyan*/
            "#add8e5"   : {"dect" : 212, "sat" : [169,110,56], "unm" : [252,252,255], "deb" : ["Hellblau","Hellblau hell","Hellblau heller"] }, /*lightblue*/
            "#87ceea"   : {"dect" : 212, "sat" : [169,110,56], "unm" : [252,252,255], "deb" : ["Himmelblau","Himmelblau hell","Himmelblau heller"] }, /*skyblue*/
            "#0000ff"   : {"dect" : 225, "sat" : [204,135,67], "unm" : [255,255,255], "deb" : ["Blau","Blau hell","Blau heller"] }, /*blue*/
            "#ed82ed"   : {"dect" : 266, "sat" : [169,110,54], "unm" : [250,250,252], "deb" : ["Lila","Lila hell","Lila heller"] }, /*puple*/
            "#ff00ff"   : {"dect" : 296, "sat" : [140, 92,46], "unm" : [250,252,255], "deb" : ["Magenta","Magenta hell","Magenta heller"] }, /*magenta*/
            "#eebbcc"   : {"dect" : 296, "sat" : [140, 92,46], "unm" : [250,252,255], "deb" : ["Rosa","Rosa hell","Rosa heller"] }, /*magenta*/
            "#ffbfcc"   : {"dect" : 335, "sat" : [180,107,51], "unm" : [255,248,250], "deb" : ["Pink","Pink hell","Pink heller"] }  /*pink*/
        }
        const col = colors[rgb.toString().toLowerCase()];
        if (typeof col != 'undefined') {
            return [col.dect, col.sat[0]];
        } else {
            return [358, 180];
        }
    }

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     * @param {() => void} callback
     */
    onUnload(callback) {
        try {
            clearInterval(this.updateInterval);
            clearInterval(this.updateTemplateInterval);
            callback();
        } catch (e) {
            callback();
        }
    }


    /**
     * Is async for onStateChange
     * @param {string} id
     * @param {ioBroker.State | null | undefined} state
     */
    async sendcommand(id, state) {
        try {
            const lastsplit = id.split('.')[id.split('.').length-1];
            const strcheck  = { username: this.config.username, sid: this.xmlvalue.sid };
            let device      = id.split(".")[2];
            let folder      = id.split(".")[3];
            let dummy       = null;
            let com         = false;
            let sendstr     = null;
            let obj         = {};
            let secsplit    = id.split('.')[id.split('.').length-3];
            let folderB     = id.split('.')[id.split('.').length-2];
            let deviceId    = await this.getStateAsync(this.namespace + "." + device + ".identifier");
            deviceId        = encodeurl(deviceId.val);

            this.log.info("SID: " + this.xmlvalue.sid);
            this.log.info("Folder: " + folder);
            this.log.info("Value: " + state.val);
            this.log.info("deviceId: " + deviceId);
            this.log.info("device: " + device);

            switch (lastsplit) {
                case "tsoll":
                    if (state.val > 7 && state.val < 32) dummy = state.val * 2;
                    else if (state.val === 254) dummy = 254;
                    else if (state.val === 253) dummy = 253;
                    else if (typeof state.val === "string") {
                        if (state.val === "true" || state.val.toLowerCase() === "on") dummy = 254;
                        else if (state.val === "false" || state.val.toLowerCase() === "off") dummy = 253;
                        com = true;
                    } else if (typeof state.val === "boolean") {
                        if (state.val) dummy = 254;
                        else if (state.val === false) dummy = 253;
                        com = true;
                    }
                    if (dummy > 0) {
                        if (com) {
                            obj = {
                                "type": "state",
                                "common": {
                                     name: "Target Temperature",
                                     role: "level.temperature",
                                     type: "mixed",
                                     write: true,
                                     read: true
                                },
                                native: {}
                            };
                        } else {
                            obj = {
                                "type": "state",
                                "common": {
                                     name: "Target Temperature",
                                     role: "level.temperature",
                                     type: "mixed",
                                     write: true,
                                     read: true,
                                     min: "-30",
                                     max: 255,
                                     unit: "Â°C"
                                },
                                native: {}
                            };
                        }
                        this.setObject(id, obj);
                        sendstr = 'ain=' + deviceId + '&switchcmd=sethkrtsoll&param=' + dummy;
                    }
                    break;
                case "temperature":
		      if (state.val > 6200) dummy = 6500;
		      else if (state.val > 5600) dummy = 5900;
		      else if (state.val > 5000) dummy = 5300;
		      else if (state.val > 4500) dummy = 4700;
		      else if (state.val > 4000) dummy = 4200;
		      else if (state.val > 3600) dummy = 3800;
		      else if (state.val > 3200) dummy = 3400;
		      else if (state.val > 2850) dummy = 3000;
                    else dummy = 2700;
                    sendstr = 'ain=' + deviceId + '&switchcmd=setcolortemperature&temperature=' + dummy + '&duration=100';
                    break;
                case "huealexa":
                    dummy = this.colors(state.val);
                    sendstr = 'ain=' + deviceId + '&switchcmd=setcolor&hue=' + dummy[0] + '&saturation=' + dummy[1] + '&duration=100';
                    break;
                case "level":
                    if (state.val >= 0 && state.val <= 255) sendstr = 'ain=' + deviceId + '&switchcmd=setlevel&level=' + state.val;
                    break;
                case "levelpercentage":
                    if (state.val >= 0 && state.val <= 100) sendstr = 'ain=' + deviceId + '&switchcmd=setlevelpercentage&level=' + state.val;
                    break;
                case "levelstring":
                    if (state.val === 0) {
                        dummy = "close";
                    } else if (state.val === 1) {
                        dummy = "open";
                    } else {
                        dummy = "stop";
                    }
                    if (dummy !== null) sendstr = 'ain=' + deviceId + '&switchcmd=setblind&target=' + dummy;
                    break;
                case "levelalexa":
                    if (state.val >= 0 && state.val <= 100) dummy = 100 - state.val;
                    if (dummy > 0) sendstr = 'ain=' + deviceId + '&switchcmd=setblind&target=' + dummy;
                    break;
                case "name":
                    if (secsplit === "button") {
                        const ident = id.substr(0, id.lastIndexOf('.'));
                        dataid = await this.getStateAsync(ident + ".identifier");
                        const obj = {
                            "type": "channel",
                            "common": {
                                "name": state.val,
                                "write": false,
                                "read": true
                            },
                            "native": {}
                        };
                        this.setObject(ident, obj);
                        sendstr = 'ain=' + encodeurl(dataid.val) + '&switchcmd=setname&name=' + encodeurl(state.val);
                    } else {
                        sendstr = 'ain=' + deviceId + '&switchcmd=setname&name=' + encodeurl(state.val);
                        obj = {
                            "type": "channel",
                            "common": {
                                "name": state.val,
                                "write": false,
                                "read": true
                            },
                            "native": {}
                        };
                        this.setObject(device, obj);
                    }
                    break;
                case "startulesubscription":
                    sendstr = '&switchcmd=startulesubscription';
                    break;
                case "sendorder":
                    sendstr = state.val;
                    break;
                case "state":
                    if (folder === 'simpleonoff') {
                        dummy = 'setsimpleonoff&onoff=' + state.val;
                    } else if (folder === 'switch') {
                        dummy = (state.val) ? "setswitchon" : "setswitchoff";
                    }
                    if (dummy !== null) sendstr = 'ain=' + deviceId + '&switchcmd=' + dummy;
                    break;
                case "statetoogle":
                    sendstr = 'ain=' + deviceId + '&switchcmd=setsimpleonoff&onoff=' + state.val;
                    break;
                case "boostactive":
                    dummy = Math.floor(Date.now() / 1000);
                    dummy = this.config.booster * 60 + dummy;
                    sendstr = 'ain=' + deviceId + '&switchcmd=sethkrboost&endtimestamp=' + dummy;
                    break;
                case "boostactiveendtime":
                    dummy = Math.floor(Date.now() / 1000)
                    if (state.val > 0 && state.val < 1441) {
                        dummy = state.val * 60 + dummy;
                        sendstr = 'ain=' + deviceId + '&switchcmd=sethkrboost&endtimestamp=' + dummy;
                    } else {
                        this.log.info("Can not create a timestamp with value: " + state.val);
                    }
                case "windowopenactiv":
                    dummy = Math.floor(Date.now() / 1000)
                    dummy = this.config.open * 60 + dummy;
                    sendstr = 'ain=' + deviceId + '&switchcmd=sethkrboost&endtimestamp=' + dummy;
                    break;
                case "windowopenactiveendtime":
                    dummy = Math.floor(Date.now() / 1000)
                    if (state.val > 0 && state.val < 1441) {
                        dummy = state.val * 60 + dummy;
                        sendstr = 'ain=' + deviceId + '&switchcmd=sethkrboost&endtimestamp=' + dummy;
                    } else {
                        this.log.info("Can not create a timestamp with value: " + state.val);
                    }
                    break;
                case "toogle":
                    deviceId = device.replace("TEMP_", "");
                    sendstr  = 'ain=' + encodeurl(deviceId) + '&switchcmd=applytemplate';
                    break;
                default:
                    sendstr = null;
                    break;
            }
            this.log.info("Order: " + sendstr);
            if (sendstr !== null) {
            //    this.Fritzbox("send", strcheck, sendstr);
            }
        } catch (e) {
            this.log.error('Sendcommand: ' + e);
        }
    }

    /**
     * Is called if a subscribed state changes
     * @param {string} id
     * @param {ioBroker.State | null | undefined} state
     */
    onStateChange(id, state) {
        if (state && !state.ack) {
            this.sendcommand(id, state);
        }
    }
}

if (require.main !== module) {
    // Export the constructor in compact mode
    /**
     * @param {Partial<utils.AdapterOptions>} [options={}]
     */
    module.exports = (options) => new Fritzboxdect(options);
} else {
    // otherwise start the instance directly
    new Fritzboxdect();
}