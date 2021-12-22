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
const getlist    = require("./lib/getlist");
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
        this.valuecheck    = null;
        this.start         = null;
        this.createDP      = new createDP(this);
        this.updateDP      = new updateDP(this);
        this.getlist       = new getlist(this);
        this.xmlvalue      = {sid: 'start', blocktime: '', pbkf2: '', homeauto: false };
        this.allobjects    = {};
        this.alltemplates  = {};
        this.allobjectsid  = null;

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
        this.updateTemplateInterval = setInterval(async () => {
            this.check = { username: this.config.username, sid: this.xmlvalue.sid };
            this.Fritzbox("templates", this.check);
        }, this.config.temp_int * 60 * 60 * 1000);
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
                icon: "/icons/control.png",
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
        });

        await this.setObjectNotExists('DECT_Control.getsubscriptionstate', {
            type: "state",
            common: {
                name: "getsubscriptionstate",
                type: "boolean",
                role: "button",
                write: true,
                read: true,
            },
            native: {},
        });

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
        });

        await this.setObjectNotExists('DECT_Control.cleanup', {
            type: "state",
            common: {
                name: "Cleanup Object Tree",
                type: "boolean",
                role: "button",
                write: true,
                read: true,
            },
            native: {},
        });

        await this.setObjectNotExists('DECT_Control.fritzfw', {
            type: "state",
            common: {
                name: "Actual Fritzbox Firmware",
                type: "mixed",
                role: "info",
                write: false,
                read: true,
            },
            native: {},
        });

        await this.setObjectNotExists('DECT_Control.fritzsid', {
            type: "state",
            common: {
                name: "Actual Fritzbox SID",
                type: "string",
                role: "info",
                write: false,
                read: true,
            },
            native: {},
        });

        await this.setObjectNotExists('DECT_Control.fritzsidTimestamp', {
            type: "state",
            common: {
                name: "Created Timestamp Fritzbox SID",
                type: "number",
                role: "indicator.date",
                write: false,
                read: true,
            },
            native: {},
        });

        await this.setObjectNotExists('DECT_Control.fritzsidTime', {
            type: "state",
            common: {
                name: "Created Time Fritzbox SID",
                type: "string",
                role: "info",
                write: false,
                read: true,
            },
            native: {},
        });
    }

    /**
     * Fritzbox!
     * Login, send and check sid Fritzbox
     * @param for switch
     * @param post param
     * @param send param
     */
    async Fritzbox(check, sendpost, sendvalue) {
        this.log.debug("Fritzbox Parameter check " + check);
        const resid = await this.requestClient
            .post(this.config.ip + '/login_sid.lua?version=2', qs.stringify(sendpost), this.Headers)
            .then((res) => res.data)
            .catch((error) => {
                this.log.error(error);
            });
        this.log.debug("Data Fritzbox " + resid);
        if (resid) {
            try {
                parser.parseString(resid, async (err, result) => {
                    let hashsid = null;
                    const home = (resid.includes('HomeAuto')) ? true : false;
                    const pbkf2 = (result.SessionInfo.Challenge.indexOf("2$") === 0) ? true : false
                    this.xmlvalue = {sid: result.SessionInfo.SID, blocktime: parseFloat(result.SessionInfo.BlockTime), pbkf2: pbkf2, homeauto: home  };
                    switch (check) {
                        case "start":
                            this.log.info("Start Adapter.");
                            if (result.SessionInfo.SID === "0000000000000000") {
                                if (pbkf2) {
                                    hashsid = await this.create_pbkdf2(result.SessionInfo.Challenge, this.config.password);
                                } else {
                                    hashsid = await this.create_md5(result.SessionInfo.Challenge, this.config.password);
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
                                return;
                            } else {
                                this.log.info("Login success with SID: " + this.xmlvalue.sid);
                                const date_ob = new Date();
                                const date = ("0" + date_ob.getDate()).slice(-2);
                                const month = ("0" + (date_ob.getMonth() + 1)).slice(-2);
                                const d_format = date + "." + month + "." + date_ob.getFullYear() + " " + date_ob.getHours() + ":" + date_ob.getMinutes() + ":" + date_ob.getSeconds();
                                const c_time = Math.floor(date_ob / 1000);
                                await this.createDataPoint('DECT_Control.fritzsid', 'Actual Fritzbox SID', 'info', 'string', false, this.xmlvalue.sid);
                                await this.createDataPoint('DECT_Control.fritzsidTimestamp', 'Created Timestamp Fritzbox SID', 'info', 'number', false, c_time);
                                await this.createDataPoint('DECT_Control.fritzsidTime', 'Created Time Fritzbox SID', 'info', 'string', false, d_format);
                                if (this.xmlvalue.homeauto === false) {
                                    this.log.error("User does not have access to DECT Devices!!");
                                    this.setState("info.connection", false, true);
                                    return;
                                }
                                this.setState("info.connection", true, true);
                                if (sendvalue !== undefined) {
                                    this.Fritzboxsend(sendvalue);
                                    return;
                                } else {
                                    this.Fritzboxdevice();
                                    this.Fritzboxtemplates();
                                    return;
                                }
                            }
                            break;
                        case "check":
                            if (result.SessionInfo.SID === this.xmlvalue.sid) {
                                this.log.debug("SID is valid");
                                this.Fritzboxdevice();
                                return;
                            } else {
                                if (this.xmlvalue.blocktime > 0) await this.sleep(this.xmlvalue.blocktime * 1000)
                                this.Fritzbox("start", this.name);
                                return;
                            }
                            break;
                        case "send":
                            if (result.SessionInfo.SID === this.xmlvalue.sid) {
                                this.log.debug("SID is valid for send order");
                                this.Fritzboxsend(sendvalue);
                                return;
                            } else {
                                if (this.xmlvalue.blocktime > 0) await this.sleep(this.xmlvalue.blocktime * 1000)
                                this.Fritzbox("start", this.name, sendvalue);
                                return;
                            }
                            break;
                        case "templates":
                            if (result.SessionInfo.SID === "0000000000000000") {
                                this.log.info("Temülate check: SID ivalid!");
                                this.setState("info.connection", false, true);
                                return;
                            } else {
                                this.log.info("Update Templates!");
                                this.Fritzboxtemplates();
                                this.deleteoldobjects();
                                return;
                            }
                            break;
                        case "dectstate":
                            this.readsubscriptionstate();
                            return;
                            break;
                        case "cleanup":
                            this.deleteoldobjects();
                            return;
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
    createFolder(ident, name, icon) {
        return new Promise(resolve => {
            this.getForeignObject(this.namespace + '.' + ident, async (err, obj) => {
                const com = {
                    name: name,
                    write: false,
                    read: true,
                }
                if (icon !== null) com.icon = icon;
                this.setObjectNotExistsAsync(ident, {
                    type: "channel",
                    common:com,
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
    createDataPoint(ident, name, role, type, write, value) {
        return new Promise(resolve => {
            this.getForeignObject(this.namespace + '.' + ident, async (err, obj) => {
                if (!obj) {
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
                    this.setStateAsync(ident, {
                        val: value,
                        ack: true
                    });
                    resolve(true);
                    })
                    .catch((error) => {
                        this.log.error(error);
                    });
                } else {
                    this.setStateAsync(ident, {
                        val: value,
                        ack: true
                    });
                    resolve(true);
                }
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
                if (obj) {
                    this.setStateAsync(ident, {
                        val: value,
                        ack: true
                    });
                    resolve(true);
                } else {
                    resolve(false);
                }
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
        let dpname        = null;
        let ident         = null;
        let devids        = null;
        this.alltemplates = {};
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
                        await this.createFolder('TEMP_' + ident, dpname, "/icons/template.png");
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
                            this.alltemplates[ident] = true;
                            db = await this.createDataPoint('TEMP_' + ident + '.' + key, key, 'info', typeof result.templatelist.template[key], false);
                            db = await this.insertValue('TEMP_' + ident + '.' + key, result.templatelist.template[key]);
                        });
                    } else {
                        Object.keys(result.templatelist.template).forEach(async (n) => {
                            this.log.debug("Multi: " + JSON.stringify(result.templatelist.template[n]));
                            maskids = null;
                            devids = null;
                            dpname = result.templatelist.template[n].name;
                            ident = result.templatelist.template[n].identifier.replace(/\s/g, '').replace(/\-1/g, '');
                            dpname = result.templatelist.template[n].name;
                            db = this.createFolder('TEMP_' + ident, dpname, "/icons/template.png");
                            db = this.createDataPoint('TEMP_' + ident + '.toogle', 'Toogle aktivieren/deaktivieren', 'button', 'boolean', true);
                            this.alltemplates[ident] = true;
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
                                db = await this.createDataPoint('TEMP_' + ident + '.' + key, key, 'info', typeof result.templatelist.template[n][key], false, result.templatelist.template[n][key]);
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
        let bitmask    = null;
        let ident      = null;
        let fw_str     = null;
        let online     = true;
        let difference = false;
        let sleepT     = this.config.dect_int_sec * 1000;
        let isblind    = 0;
        if (dectdata.includes('<group')) dectdata = dectdata.replace(/\<group/g, '<device').replace(/\<\/group/g, '</device')
        this.log.debug(JSON.stringify(dectdata));
        if (dectdata !== this.valuecheck || this.start === null) {
            this.log.debug("Unterschied");
            difference = true;
        } else {
            this.log.debug("Kein Unterschied");
        }
        if (this.isXMLString(dectdata) && difference && (dectdata !== null || dectdata !== undefined)) {
            try {
                parser.parseString(dectdata, async (err, result) => {
                    dectdata = null;
                    if (result.devicelist.device !== undefined) {
                        if (this.start === null) {
                            this.start = 1;
                            this.strcheck = JSON.parse(JSON.stringify(result.devicelist));
                            this.createDataPoint('DECT_Control.fritzfw', 'Actual Fritzbox Firmware', 'info', 'mixed', false, result.devicelist.fwversion);
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
                                if (result.devicelist.device.present === 0) online = false;
                                if (fw_str) {
                                    result.devicelist.device.fwversion = fw_str;
                                    fw_str = null;
                                }
                                ident = result.devicelist.device.identifier.replace(/\s/g, '').replace(/\-1/g, '');
                                if (this.start === 1) {
                                    this.createDP.parse(isblind, result.devicelist.device, 'DECT_' + ident, result.devicelist.device);
                                } else {
                                    if (this.allobjects['DECT_' + ident] && online) {
                                        this.updateDP.parse(this.allobjectsid, isblind, this.strcheck.device, 'DECT_' + ident, result.devicelist.device);
                                    }
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
                                    if (result.devicelist.device[n].present === 0) online = false;
                                    if (fw_str) {
                                        result.devicelist.device[n].fwversion = fw_str;
                                        fw_str = null;
                                    }
                                    ident = result.devicelist.device[n].identifier.replace(/\s/g, '').replace(/\-1/g, '');
                                    if (this.start === 1) {
                                        this.createDP.parse(isblind, result.devicelist.device[n], 'DECT_' + ident, result.devicelist.device[n]);
                                    } else {
                                        if (this.allobjects['DECT_' + ident] && online) {
                                            this.updateDP.parse(this.allobjectsid, isblind, this.strcheck.device[n], 'DECT_' + ident, result.devicelist.device[n]);
                                        }
                                        online = true;
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
            if (this.start === 1) sleepT = 5000;
            await this.sleep(sleepT);
            if (this.start === 1) this.startreadallobjects();
            if (this.config.extendForeign) {
                try {
                    await this.extendForeignObjectAsync(`system.adapter.${this.namespace}`, {native: {extendForeign: false}});
                } catch (e) {
                    this.log.error("Could not set extendForeign: " + e.message);
                }
            }
            this.check = { username: this.config.username, sid: this.xmlvalue.sid };
            this.Fritzbox("check", this.check);
        } else {
            await this.sleep(sleepT);
            if (this.start === 1) this.startreadallobjects();
            this.check = { username: this.config.username, sid: this.xmlvalue.sid };
            this.Fritzbox("check", this.check);
        }
    }

    /**
     * startreadallobjects! Read object tree start
     */
    async startreadallobjects() {
        this.allobjectsid = await this.readallobjects();
    }

    /**
     * readallobjects! Read object tree
     */
    readallobjects() {
        this.allobjectsid = '';
        let ids = '';
        return new Promise(resolve => {
            this.getForeignObjects(this.namespace + '.*',(err, obj) => {
                if (err) {
                    this.log.debug("Read Object: " + err);
                    resolve(this.allobjectsid);
                } else {
                    Object.keys(obj).forEach((key) => {
                        ids += key + "|";
                        key = key.split(".")[2];
                        this.allobjects[key] = true;
                    });
                    resolve(ids);
                }
            });
        });
    }

    /**
     * deleteoldobjects! Delete old channels
     */
    deleteoldobjects() {
        if ((this.allobjects) && (this.strcheck)) {
            let searchStr = '';
            const isStr   = JSON.stringify(this.strcheck).toString().replace(/\s/g, '') + JSON.stringify(this.alltemplates);
            Object.keys(this.allobjects).forEach((key) => {
                searchStr = key.replace(/\DECT_/g, '').replace(/\TEMP_/g, '');
                if (isStr.includes(searchStr) || key === "DECT_Control") {
                    this.log.info("This folder will not be deleted: " + key);
                } else {
                    if (key !== undefined) {
                        this.log.warn("This folder will be deleted: " + key);
                        this.delForeignObject(key);
                    }
                }
            });
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
            .then((res) => res)
            .catch((error) => {
                this.log.error("GET SEND: " + error);
            });
        try {
            if (resid.status !== 200) {
                this.log.error('Fritzboxsend: Response from Fritzbox: ' + resid.status);
                this.Fritzbox("start", this.name, sendvalue);
                return;
            } else if (resid.data === undefined) {
                this.log.error('Fritzboxsend: Date from Fritzbox are undefined!!');
                this.Fritzbox("start", this.name, sendvalue);
                return;
            }
            this.log.info("Send: " + resid.data); //Wenn Wert dann OK
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
            const fritzlogout = { logout: "logout", sid: this.xmlvalue.sid };
            this.Fritzbox("logout", fritzlogout);
            clearInterval(this.updateInterval);
            clearInterval(this.updateTemplateInterval);
            clearInterval(sidcheck);
            callback();
        } catch (e) {
            callback();
        }
    }

    /**
     * readsubscriptionstate
     */
    async readsubscriptionstate() {
        this.log.info("Load subscription state");
        if (this.xmlvalue.sid === "0000000000000000") {
            this.setState("info.connection", false, true);
            this.log.error("Missing SID!! - readsubscriptionstate: " + this.xmlvalue.sid);
            this.Fritzbox("start", this.name);
            return;
        }
        const resid = await this.requestClient
            .get(this.config.ip + '/webservices/homeautoswitch.lua?switchcmd=getsubscriptionstate&sid=' + this.xmlvalue.sid)
            .then((res) => res)
            .catch((error) => {
                this.log.error("GET readsubscriptionstate: " + error);
            });

        if (resid.status !== 200) {
            this.log.error('readsubscriptionstate: Response from Fritzbox: ' + resid.status);
            await this.sleep(10000);
            this.Fritzbox("start", this.name);
            return;
        } else if (resid.data === undefined) {
            this.log.error('readsubscriptionstate: Date from Fritzbox are undefined!!');
            await this.sleep(10000);
            this.Fritzbox("start", this.name);
            return;
        }

        let dectdata = resid.data.toString("utf-8").trim();
        this.log.debug(JSON.stringify(dectdata));
        if (this.isXMLString(dectdata) && (dectdata !== null || dectdata !== undefined)) {
            try {
                parser.parseString(dectdata, async (err, result) => {
                   this.log.debug(JSON.stringify(result.state.code) + "-" + result.state.latestain);
                    await this.setObjectNotExistsAsync('DECT_Control.DECT', {
                        type: "channel",
                        common: {
                            name: "DECT connect state",
                            role: "state",
                        },
                        native: {},
                    });

                    await this.setObjectNotExists('DECT_Control.DECT.state', {
                        type: "state",
                        common: {
                            name: "startulesubscription",
                            type: "number",
                            role: "info",
                            write: false,
                            read: true,
                            states: {
                                "0": "Anmeldung lÃ¤uft nicht",
                                "1": "Anmeldung lÃ¤uft",
                                "2": "timeout",
                                "3": "sonstiger Error Unterknoten"
                            }
                        },
                        native: {},
                    })

                    await this.setObjectNotExists('DECT_Control.DECT.latestain', {
                        type: "state",
                        common: {
                            name: "Latest AIN",
                            type: "string",
                            role: "info",
                            write: false,
                            read: true
                        },
                        native: {},
                    })
                    this.insertValue('DECT_Control.DECT.state', result.state.state);
                    this.insertValue('DECT_Control.DECT.latestain', result.state.latestain);
                });
            } catch (e) {
                this.log.error('Parse error: ' + e);
            }
        }
    }

    /**
     * loadvalues!
     * @param id - Object
     * @param cmd - Value for switchcmd
     */
    async loadvalues(tem, id, cmd) {
        if (this.xmlvalue.sid === "0000000000000000") {
            this.setState("info.connection", false, true);
            this.log.error("Missing SID!! - loadvalues: " + this.xmlvalue.sid);
            this.Fritzbox("start", this.name);
            return;
        }
        const resid = await this.requestClient
            .get(this.config.ip + '/webservices/homeautoswitch.lua?switchcmd=' + cmd + '&sid=' + this.xmlvalue.sid)
            .then((res) => res)
            .catch((error) => {
                this.log.error("GET loadvalues: " + error);
            });

        if (resid.status !== 200) {
            this.log.error('loadvalues: Response from Fritzbox: ' + resid.status);
            await this.sleep(10000);
            this.Fritzbox("start", this.name);
            return;
        } else if (resid.data === undefined) {
            this.log.error('loadvalues: Date from Fritzbox are undefined!!');
            await this.sleep(10000);
            this.Fritzbox("start", this.name);
            return;
        }
        let dectdata = resid.data.toString("utf-8").trim();
        let folder     = '';
        let foldername = '';
        let counter    = '';
        let colorname  = {};
        this.log.debug("temp: " + JSON.stringify(dectdata));
        if (this.isXMLString(dectdata) && (dectdata !== null || dectdata !== undefined)) {
            try {
                parser.parseString(dectdata, (err, result) => {
                    if (tem === 1) {
                        result = JSON.parse(JSON.stringify(result.devicestats.temperature).replace(/\_/g, 'value'));
                        this.getlist.parse(id + ".temperatur", result);
                    } else if (tem === 0) {
                        dectdata = JSON.parse(JSON.stringify(result.devicestats.voltage).replace(/\_/g, 'value'));
                        this.getlist.parse(id + ".voltage", dectdata.stats);
                        dectdata = JSON.parse(JSON.stringify(result.devicestats.power).replace(/\_/g, 'value'));
                        this.getlist.parse(id + ".power", dectdata.stats);
                        dectdata = JSON.stringify(result.devicestats.energy).replace(/_/, 'wh');
                        dectdata = JSON.parse(dectdata.replace(/_/, 'watt'));
                        for(const val of dectdata.stats) {
                            ++counter;
                            if (counter === 1) folder = "watt";
                            if (counter === 2) folder = "wh";
                            this.getlist.parse(id + ".energy." + folder, val);
                        }
                   } else if (tem === 2) {
                        Object.keys(result.colordefaults.hsdefaults.hs).forEach((n) => {
                             Object.keys(result.colordefaults.hsdefaults.hs[n]).forEach((k) => {
                                  if (k === "hue_index") folder = k + result.colordefaults.hsdefaults.hs[n][k];
                                  if (k === "name") {
                                       foldername = result.colordefaults.hsdefaults.hs[n][k]._;
                                       this.createFolder(id + "." + folder, foldername, null);
                                  }
                                  if (Array.isArray(result.colordefaults.hsdefaults.hs[n][k])) {
                                       for(const val of result.colordefaults.hsdefaults.hs[n][k]) {
                                            this.getlist.parse(id + "." + folder + ".sat_index" + val.sat_index, val);
                                       }
                                  }
                             });
                        });
                        if (Array.isArray(result.colordefaults.temperaturedefaults.temp)) {
                             for(const val of result.colordefaults.temperaturedefaults.temp) {
 		                    if (val.value === "6500") colorname.tageslicht_3 = 6500;
		                    else if (val.value === "5900") colorname.tageslicht_2 = 5900;
		                    else if (val.value === "5300") colorname.tageslicht_1 = 5300;
		                    else if (val.value === "4700") colorname.neutral_3 = 4700;
		                    else if (val.value === "4200") colorname.neutral_2 = 4200;
		                    else if (val.value === "3800") colorname.neutral_1 = 3800;
		                    else if (val.value === "3400") colorname.warmweiss_3 = 3400;
		                    else if (val.value === "3000") colorname.warmweiss_2 = 3000;
                                  else colorname.warmweiss_1 = 2700;
                             }
                             this.getlist.parse(id + ".temperature", colorname);
                        }
                   }
                   this.log.debug("Loadvalues: " + JSON.stringify(result));
                });
            } catch (e) {
                this.log.error('Parse error: ' + e);
            }
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
            const present   = await this.getStateAsync(this.namespace + "." + device + ".present");
            let actemp      = null;
            deviceId        = encodeurl(deviceId.val);

            if (!present.val) {
                this.log.warn("Device " + device + " is offline");
                return;
            }

            this.log.debug("SID: " + this.xmlvalue.sid);
            this.log.debug("Folder: " + folder);
            this.log.debug("Value: " + state.val);
            this.log.debug("deviceId: " + deviceId);
            this.log.debug("device: " + device);
            if (lastsplit === "alexapower" ||
                lastsplit === "alexamode" ||
                lastsplit === "alexaparty" ||
                lastsplit === "tsoll") {
                const nexttemp = await this.getStateAsync(this.namespace + "." + device + ".hkr.nextchange.tchange");
                const absenk   = await this.getStateAsync(this.namespace + "." + device + ".hkr.absenk");
                const komfort  = await this.getStateAsync(this.namespace + "." + device + ".hkr.komfort");
                if (nexttemp.val === absenk.val) actemp = komfort.val * 2;
                else if (nexttemp.val === komfort.val) actemp = absenk.val * 2;
                else actemp = absenk.val * 2;
            }

            switch (lastsplit) {
                case "loadpowerstatic":
                    this.loadvalues(0, device + '.devicestats', 'getbasicdevicestats&ain=' + deviceId);
                    return;
                    break;
                case "loadtempstatic":
                    this.loadvalues(1, device + '.devicestats', 'getbasicdevicestats&ain=' + deviceId);
                    return;
                    break;
                case "loadcolor":
                    this.loadvalues(2, device + '.devicecolor', 'getcolordefaults&ain=' + deviceId);
                    return;
                    break;
                case "alexaonoff":
                    if (state.val) {
                        dummy = 1;
                    } else {
                        dummy = 0;
                    }
                    sendstr = 'ain=' + deviceId + '&switchcmd=setsimpleonoff&onoff=' + dummy;
                    break;
                case "alexapower":
                    if (state.val) {
                        dummy = actemp;
                    } else {
                        dummy = 253;
                    }
                    sendstr = 'ain=' + deviceId + '&switchcmd=sethkrtsoll&param=' + dummy;
                    break;
                case "alexamode":
                    if (state.val === 0) {
                        dummy = actemp;
                    } else {
                        dummy = 253;
                    }
                    sendstr = 'ain=' + deviceId + '&switchcmd=sethkrtsoll&param=' + dummy;
                    break;
                case "alexaparty":
                    if (state.val) {
                        dummy = 16;
                    } else {
                        dummy = actemp;
                    }
                    sendstr = 'ain=' + deviceId + '&switchcmd=sethkrtsoll&param=' + dummy;
                    break;
                case "tsoll":
                    if (state.val > 7 && state.val < 32) dummy = state.val * 2;
                    else if (state.val === 254 || state.val === 2) dummy = 254;
                    else if (state.val === 0) {
                        dummy = actemp;
                    } else if (state.val === 253 || state.val === 1) dummy = 253;
                    else if (typeof state.val === "string") {
                        if (state.val === "true" || state.val.toLowerCase() === "on" || state.val.toLowerCase() === "open") dummy = 254;
                        else if (state.val === "false" || state.val.toLowerCase() === "off" || state.val.toLowerCase() === "closed") dummy = 253;
                        com = true;
                    } else if (typeof state.val === "boolean") {
                        if (state.val) dummy = 254;
                        else if (state.val === false) dummy = 253;
                        com = true;
                    }
                    this.log.debug("dummy: " + dummy);
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

                case "hue":
                    const sat = await this.getStateAsync(this.namespace + "." + device + ".colorcontrol.saturation");
                    sendstr = 'ain=' + deviceId + '&switchcmd=setcolor&hue=' + state.val + '&saturation=' + sat + '&duration=100';
                    break;
                case "level":
                    if (state.val >= 0 && state.val <= 255) sendstr = 'ain=' + deviceId + '&switchcmd=setlevel&level=' + state.val;
                    break;
                case "levelpercentage":
                    if (state.val >= 0 && state.val <= 100) sendstr = 'ain=' + deviceId + '&switchcmd=setlevelpercentage&level=' + state.val;
                    break;
                case "alexastop":
                    if (state.val) sendstr = 'ain=' + deviceId + '&switchcmd=setblind&target=stop';
                    break;
                case "alexaopen":
                    if (state.val) sendstr = 'ain=' + deviceId + '&switchcmd=setblind&target=open';
                    break;
                case "alexaclose":
                    if (state.val) sendstr = 'ain=' + deviceId + '&switchcmd=setblind&target=close';
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
                        this.getForeignObject(this.namespace + '.' + device, (err, obj) => {
                            if (obj) {
                                obj.common.name = state.val;
                                this.setObject(device, obj);
                            }
                        });
                    }
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
            this.log.info("command: " + sendstr);
            if (sendstr !== null) {
                this.Fritzbox("send", strcheck, sendstr);
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
            const lastsplit   = id.split('.')[id.split('.').length-1];
            const device      = id.split(".")[2];
            const strcheck    = { username: this.config.username, sid: this.xmlvalue.sid };
            if (lastsplit === "getsubscriptionstate") {
                this.Fritzbox("dectstate", strcheck);
                return;
            }
            if (lastsplit === "cleanup") {
                this.Fritzbox("cleanup", strcheck);
                return;
            }
            if (lastsplit === "startulesubscription") {
                this.Fritzbox("send", strcheck, '&switchcmd=startulesubscription');
                return;
            }
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