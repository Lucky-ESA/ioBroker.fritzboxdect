const EventEmitter = require("events");
const HTMLParser = require("node-html-parser");
const axios = require("axios");
const https = require("https");
const http = require("http");
const crypto = require("crypto");
const parser = require("./xml2json");
const httpsAgent = new https.Agent({
    rejectUnauthorized: false,
});

class Fritzbox extends EventEmitter {
    constructor(config, adapter) {
        super();
        this.adapter = adapter;
        this.config = config;
        this.waiting = null;
        this.infoInterval = null;
        this.tempInterval = null;
        this.checkInterval = null;
        this.restart = null;
        this.restart_count = 0;
        this.restart_active = false;
        this.isWork = false;
        this.check = false;
        this.lastValue = {};
        this.counter = 0;
        this.sendCommandRequest = {};
        this.mask = {};
        this.channels_array = [];
        this.dect = {};
        this.group = {};
        this.template = {};
        this.trigger = {};
        this.isonunload = false;
        const data = {};
        this.sid_status = false;
        if (config.protocol === "https") {
            data.agent = httpsAgent;
        }
        data.baseURL = `${config.protocol}://${config.ip}`;
        this.requestClient = axios.create({
            withCredentials: true,
            httpAgent: new http.Agent({ keepAlive: true }),
            httpsAgent: new https.Agent({ keepAlive: true }),
            timeout: 5000,
            headers: {
                "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                "Accept-Endcoding": "gzip",
                "user-agent":
                    "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Mobile Safari/537.36",
            },
            ...data,
        });
    }

    async osversion() {
        const version = await this.sendRequest("GET", "/jason_boxinfo.xml", null, true, false);
        try {
            const fullVersion = version ? version.match("<j:Version>(.*?)</j:Version>")[1] : "0.0";
            const parts = fullVersion.split(".");
            return `${parts[1]}.${parts[2]}`;
        } catch (e) {
            this.adapter.log.warn(`osversion: ${JSON.stringify(e)}`);
            return 0;
        }
    }

    updateChannel(channel) {
        this.channels_array = [];
        this.channels_array = channel;
    }

    async login() {
        const login = await this.sendRequest("GET", "/login_sid.lua?version=2", null, true, false);
        try {
            const challenge = login ? login.match("<Challenge>(.*?)</Challenge>")[1] : "";
            const challengeAnswer = await this.solveChallenge(challenge, this.config);
            //this.adapter.log.debug(challengeAnswer);
            const params = {
                data: {
                    username: this.config.user,
                    response: challengeAnswer,
                },
            };
            const sid = await this.sendRequest("post", "/login_sid.lua?version=2", params, true, false);
            const home = sid.includes("HomeAuto") ? true : false;
            this.config.response_sid = parser.xml2json(sid);
            this.adapter.log.debug(`SessionID: ${JSON.stringify(this.config.response_sid)}`);
            if (this.config.response_sid.SessionInfo && this.config.response_sid.SessionInfo.BlockTime != null) {
                this.config.response_sid.SessionInfo.BlockTime = parseFloat(
                    this.config.response_sid.SessionInfo.BlockTime,
                );
            } else {
                this.adapter.log.warn(`Cannot found Blocktime!!`);
                this.setDP("0000000000000000", false);
                return false;
            }
            const block_time = this.config.response_sid.SessionInfo.BlockTime;
            if (block_time > 0) {
                if (block_time === 1) {
                    this.adapter.log.info(`Login is blocked for ${block_time} second.`);
                } else {
                    this.adapter.log.info(`Login is blocked for ${block_time} seconds.`);
                }
                this.restart && this.adapter.clearInterval(this.restart);
                this.restart = null;
                this.setDP("0000000000000000", false);
                await this.sleep(block_time * 1000 + 100);
                return "BLOCK";
            }
            if (
                this.config.response_sid &&
                this.config.response_sid.SessionInfo &&
                this.config.response_sid.SessionInfo.SID === "0000000000000000"
            ) {
                this.setDP("0000000000000000", false);
                this.adapter.log.warn("Login invalid! Wrong username or password!");
                return false;
            }
            if (!home) {
                this.adapter.log.warn("User does not have access to DECT Devices!!");
                return false;
            }
            if (
                this.config.response_sid &&
                this.config.response_sid.SessionInfo &&
                this.config.response_sid.SessionInfo.SID &&
                this.config.response_sid.SessionInfo.SID !== "0000000000000000"
            ) {
                this.adapter.log.info("Login valid.");
                this.loadMonitor();
                this.adapter.log.debug(JSON.stringify(this.config.response_sid));
                !this.sid_status && (await this.adapter.setState("info.connection", { val: true, ack: true }));
                this.sid_status = true;
                await this.adapter.setState(`${this.config.dp}.DECT_Control.sid`, {
                    val: this.config.response_sid.SessionInfo.SID,
                    ack: true,
                });
                this.setDP(this.config.response_sid.SessionInfo.SID, true);
                return this.config.response_sid;
            }
            this.adapter.log.warn(JSON.stringify(this.config.response_sid));
            this.adapter.log.warn(sid);
            return false;
        } catch (e) {
            this.adapter.log.info(`login: ${e}`);
            return false;
        }
    }

    async relogin() {
        this.restart_active = true;
        this.check = true;
        const login = await this.login();
        if (!login || login == "BLOCK") {
            this.relogInterval();
        } else {
            this.restart && this.adapter.clearInterval(this.restart);
            this.restart = null;
            this.restart_count = 0;
            this.resendCommand();
            this.setDECTInterval();
        }
        ++this.restart_count;
        if (this.restart_count > 20) {
            await this.destroy();
            this.adapter.log.error(
                `Login not possible. Please check the data in the instance setting and restart the adapter.`,
            );
        }
        this.restart_active = false;
        this.check = false;
    }

    relogInterval() {
        this.restart && this.adapter.clearInterval(this.restart);
        this.restart = null;
        this.restart = this.adapter.setInterval(async () => {
            if (!this.restart_active) {
                this.relogin();
            }
        }, 1000 * 30);
    }

    resendCommand() {
        if (Object.keys(this.sendCommandRequest).length > 0) {
            const timestamp = Date.now();
            for (const command in this.sendCommandRequest) {
                const old_timstamp = this.sendCommandRequest[command].timestamp;
                const diff_timestamp = timestamp - old_timstamp;
                const old = 60 * 1000 * 15; // 15 Minutes
                if (diff_timestamp < old) {
                    this.getCommand("GET", this.sendCommandRequest[command].url);
                    this.adapter.log.info(`Resend command - ${this.sendCommandRequest[command].url}`);
                } else {
                    this.adapter.log.info(`Delete command without resend - ${this.sendCommandRequest[command].url}`);
                }
                delete this.sendCommandRequest[command];
            }
        }
    }

    async getStatusULE() {
        const resp = await this.sendRequest(
            "GET",
            `/webservices/homeautoswitch.lua?switchcmd=getsubscriptionstate&sid=${this.config.response_sid.SessionInfo.SID}`,
            null,
            false,
            false,
        );
        if (resp && resp.statusText === "OK") {
            const response = parser.xml2json(resp.data);
            this.adapter.log.debug(`OK: ${JSON.stringify(response)}`);
            await this.adapter.setState(`${this.config.dp}.DECT_Control.subscriptionstate`, {
                val: response.state.code,
                ack: true,
            });
            await this.adapter.setState(`${this.config.dp}.DECT_Control.subscriptionslatest`, {
                val: response.state.latestain,
                ack: true,
            });
        } else {
            this.adapter.log.warn(`Cannot load ULE state!`);
        }
    }

    async getStatistic(methode, url, path, com) {
        const resp = await this.sendRequest(
            methode,
            `/webservices/homeautoswitch.lua?${url}${this.config.response_sid.SessionInfo.SID}`,
            null,
            false,
            false,
        );
        if (resp && resp.statusText === "OK") {
            const response = parser.xml2json(resp.data);
            if (response && response.devicestats && Object.keys(response.devicestats).length > 0) {
                for (const statis in response.devicestats) {
                    await this.createStatistic(response.devicestats[statis].stats, path, com, statis);
                }
            } else if (response && response.colordefaults) {
                if (
                    response.colordefaults.hsdefaults &&
                    response.colordefaults.hsdefaults.hs &&
                    Object.keys(response.colordefaults.hsdefaults.hs).length > 0
                ) {
                    for (const statis of response.colordefaults.hsdefaults.hs) {
                        await this.createColor(statis, path, com);
                    }
                }
                if (
                    response.colordefaults.temperaturedefaults &&
                    response.colordefaults.temperaturedefaults.temp &&
                    Object.keys(response.colordefaults.temperaturedefaults.temp).length > 0
                ) {
                    await this.createTemperature(response.colordefaults.temperaturedefaults.temp, path, com);
                } else {
                    this.adapter.log.warn(`Cannot read statisctic - ${JSON.stringify(resp.data)}`);
                }
            } else {
                this.adapter.log.warn(`Cannot read statisctic - ${JSON.stringify(resp.data)}`);
            }
        } else {
            this.adapter.log.warn(`Cannot load statistic!`);
        }
    }

    /**
     * @param {object} color
     * @param {string} path
     * @param {object} com
     */
    async createTemperature(color, path, com) {
        let common = {};
        common = {
            name: com.commons["getColors"],
            desc: "Colors",
            icon: "img/colors.png",
        };
        await this.adapter.createDataPoint(`${path}.devicecolors`, common, "folder", null);
        common = {
            name: com.commons["getTemperature"],
            desc: "Color temperature",
            icon: "img/temperature.png",
        };
        await this.adapter.createDataPoint(`${path}.devicecolors.temperature`, common, "folder", null);
        for (const temp of color) {
            if (temp && temp.value != null) {
                if (com && com.commons && com.commons["temp"]) {
                    common = com.commons["temp"];
                    await this.adapter.createDataPoint(
                        `${path}.devicecolors.temperature.temp_${temp.value}`,
                        common,
                        "state",
                        temp.value,
                    );
                } else {
                    this.adapter.log.warn(`Key temp is unknown. Please create an issue!`);
                }
            }
        }
    }

    /**
     * @param {object} color
     * @param {string} path
     * @param {object} com
     */
    async createColor(color, path, com) {
        let common = {};
        common = {
            name: com.commons["getColors"],
            desc: "Colors",
            icon: "img/colors.png",
        };
        await this.adapter.createDataPoint(`${path}.devicecolors`, common, "folder", null);
        if (color.hue_index != null && color.name && color.name["_@attribute"] && com.commons.colors[color.name.enum]) {
            const folder = color.hue_index.toString().length === 1 ? `0${color.hue_index}` : color.hue_index;
            const coloricon = `img/${com.commons.colors[color.name.enum]}.png`;
            common = {
                name: color.name["_@attribute"],
                desc: color.name["_@attribute"],
                icon: coloricon,
            };
            await this.adapter.createDataPoint(`${path}.devicecolors.hue_index${folder}`, common, "folder", null);
            for (const colors of color.color) {
                let folder_hue = "";
                for (const att in colors) {
                    if (att === "sat_index") {
                        folder_hue =
                            colors[att].toString().length === 1 ? `${att}0${colors[att]}` : `${att}${colors[att]}`;
                        common = {
                            name: color.name["_@attribute"],
                            desc: color.name["_@attribute"],
                            icon: coloricon,
                        };
                        await this.adapter.createDataPoint(
                            `${path}.devicecolors.hue_index${folder}.${folder_hue}`,
                            common,
                            "folder",
                            null,
                        );
                    } else {
                        if (com && com.hue_colors && com.hue_colors[att]) {
                            common = com.hue_colors[att];
                            await this.adapter.createDataPoint(
                                `${path}.devicecolors.hue_index${folder}.${folder_hue}.${att}`,
                                common,
                                "state",
                                colors[att],
                            );
                        } else {
                            this.adapter.log.warn(`Key ${att} is unknown. Please create an issue!`);
                        }
                    }
                }
            }
        } else {
            this.adapter.log.warn(`This color scheme is unknown. - ${JSON.stringify(color)}`);
        }
    }

    /**
     * @param {object} devices
     * @param {string} path
     * @param {object} com
     * @param {string} dp_name
     */
    async createStatistic(devices, path, com, dp_name) {
        let common = {};
        let device_array = [];
        let icon = "";
        if (!devices) {
            return;
        }
        if (Object.keys(devices).length == 0) {
            return;
        } else if (Object.keys(devices).length == 1) {
            device_array.push(devices);
        } else {
            device_array = devices;
        }
        if (dp_name === "temperature") {
            icon = "img/temperature.png";
        } else if (dp_name === "voltage") {
            icon = "img/voltage.png";
        } else if (dp_name === "energy") {
            icon = "img/energy.png";
        } else if (dp_name === "power") {
            icon = "img/power.png";
        }
        common = {
            name: com.commons["getStatistic"].name,
            desc: "Statistic",
            icon: "img/statistic.png",
        };
        await this.adapter.createDataPoint(`${path}.devicestatistic`, common, "folder", null);
        for (let device in device_array) {
            let arr;
            common = {
                name: dp_name,
                desc: dp_name,
                icon: icon,
            };
            await this.adapter.createDataPoint(`${path}.devicestatistic.${dp_name}`, common, "folder", null);
            if (typeof device_array[device] === "object") {
                common = {
                    name: `${dp_name} - ${device}`,
                    desc: `${dp_name} - ${device}`,
                    icon: icon,
                };
                await this.adapter.createDataPoint(
                    `${path}.devicestatistic.${dp_name}.${device}`,
                    common,
                    "folder",
                    null,
                );
                for (let keys in device_array[device]) {
                    if (keys === "_@attribute") {
                        arr = JSON.stringify(device_array[device][keys]);
                        keys = "value";
                        arr = device_array[device]["_@attribute"].split(",").map(Number);
                        if (arr && arr.length > 0) {
                            const time_arr = device_array[device]["grid"];
                            let time_count = device_array[device]["datatime"];
                            const static_val = [];
                            for (const val of arr) {
                                const stat = {
                                    time: time_count,
                                    val: val,
                                };
                                time_count = time_count - time_arr;
                                static_val.push(stat);
                            }
                            if (com && com.commons && com.commons["chart"]) {
                                common = com.commons["chart"];
                                await this.adapter.createDataPoint(
                                    `${path}.devicestatistic.${dp_name}.chart`,
                                    common,
                                    "state",
                                    JSON.stringify(static_val),
                                );
                            } else {
                                this.adapter.log.warn(`Key ${device} is unknown. Please create an issue!`);
                            }
                        }
                    } else {
                        arr = device_array[device][keys];
                    }
                    if (com && com.commons && com.commons[keys]) {
                        common = com.commons[keys];
                        await this.adapter.createDataPoint(
                            `${path}.devicestatistic.${dp_name}.${device}.${keys}`,
                            common,
                            "state",
                            arr,
                        );
                    } else {
                        this.adapter.log.warn(`Key ${keys} is unknown. Please create an issue!`);
                    }
                }
            } else {
                if (device == "_@attribute") {
                    arr = JSON.stringify(device_array[device]);
                    device = "value";
                    arr = device_array["_@attribute"].split(",").map(Number);
                    if (arr && arr.length > 0) {
                        const time_arr = device_array["grid"];
                        let time_count = device_array["datatime"];
                        const static_val = [];
                        for (const val of arr) {
                            const stat = {
                                time: time_count,
                                val: val,
                            };
                            time_count = time_count - time_arr;
                            static_val.push(stat);
                        }
                        if (com && com.commons && com.commons["chart"]) {
                            common = com.commons["chart"];
                            await this.adapter.createDataPoint(
                                `${path}.devicestatistic.${dp_name}.chart`,
                                common,
                                "state",
                                JSON.stringify(static_val),
                            );
                        } else {
                            this.adapter.log.warn(`Key ${device} is unknown. Please create an issue!`);
                        }
                    }
                } else {
                    arr = device_array[device];
                }
                if (com && com.commons && com.commons[device]) {
                    common = com.commons[device];
                    await this.adapter.createDataPoint(
                        `${path}.devicestatistic.${dp_name}.${device}`,
                        common,
                        "state",
                        arr,
                    );
                } else {
                    this.adapter.log.warn(`Key ${device} is unknown. Please create an issue!`);
                }
            }
        }
    }

    /**
     * @param {string} fritz
     * @param {string} state
     * @param {object | null | undefined} obj
     */
    async sendHTTP(fritz, state, obj) {
        const data = await this.requestClient({
            method: "POST",
            url: "/data.lua",
            data: { page: state, sid: this.config.response_sid.SessionInfo.SID },
        })
            .then(async res => {
                if (res.data) {
                    return res.data;
                }
                return res;
            })
            .catch(error => {
                return error;
            });
        await this.adapter.setState(`${this.config.dp}.TR_064.States.sendHTTPResponse`, {
            val: typeof data === "object" ? JSON.stringify(data) : data,
            ack: true,
        });
        if (obj != null) {
            this.adapter.sendTo(obj.from, obj.command, JSON.stringify(data), obj.callback);
        }
    }

    async getCommand(methode, url, id, value) {
        this.adapter.log.info(`getCommandRequest: ${JSON.stringify(url)}`);
        const resp = await this.sendRequest(
            methode,
            `/webservices/homeautoswitch.lua?${url}${this.config.response_sid.SessionInfo.SID}`,
            null,
            false,
            true,
        );
        this.lastValue[id] = JSON.stringify(value);
        if (resp && resp.statusText === "OK") {
            this.adapter.log.info(`getCommandResponse: ${JSON.stringify(resp.data)}`);
        } else if (resp && resp.response && resp.response.status == 403) {
            this.adapter.log.warn(
                `Session ID invalid or user not authorized! - ${this.config.response_sid.SessionInfo.SID}`,
            );
            this.sid_status && (await this.adapter.setState("info.connection", { val: false, ack: true }));
            this.sid_status = false;
            this.sendCommandRequest[this.counter] = { url: url, timestamp: Date.now() };
            ++this.counter;
            this.check = true;
            this.relogin();
        } else if (resp && resp.response && resp.response.status == 404) {
            this.adapter.log.warn(`HTTP request incorrect!!`);
        } else if (resp && resp.response && resp.response.status == 400) {
            this.adapter.log.warn(
                `HTTP request incorrect, Parameters are invalid, do not exist or the value range has been exceeded!`,
            );
        } else if (resp && resp.response && resp.response.status == 500) {
            this.adapter.log.warn(`Internal error command!`);
        } else if (resp && resp != null && resp.toString().indexOf("timeout") != -1) {
            this.adapter.log.warn(`Request error command! - ${resp}`);
        } else {
            this.adapter.log.warn(`Unknown error command - ${JSON.stringify(resp)}`);
        }
    }

    async fritzRequest(methode, url, request) {
        if (
            !this.config.response_sid ||
            !this.config.response_sid.SessionInfo ||
            this.config.response_sid.SessionInfo.SID === "0000000000000000"
        ) {
            this.adapter.log.warn(`Session ID invalid!`);
            return false;
        }
        let resp = await this.sendRequest(
            methode,
            `${url}${this.config.response_sid.SessionInfo.SID}`,
            null,
            true,
            true,
        );
        if (this.adapter.viewdebug) {
            this.adapter.log.debug(`fritzRequest: " ${JSON.stringify(resp)}`);
        }
        if (resp && resp.response && resp.response.status == 403) {
            this.adapter.log.warn(
                `Session ID invalid or user not authorized! - ${this.config.response_sid.SessionInfo.SID}`,
            );
            this.sid_status && (await this.adapter.setState("info.connection", { val: false, ack: true }));
            this.sid_status = false;
            return false;
        } else if (resp && resp.response && resp.response.status == 400) {
            this.adapter.log.warn(
                `HTTP request incorrect, Parameters are invalid, do not exist or the value range has been exceeded!`,
            );
            return false;
        } else if (resp && resp.response && resp.response.status == 404) {
            this.adapter.log.warn(`HTTP request incorrect!!`);
            return false;
        } else if (resp && resp.response && resp.response.status == 500) {
            this.adapter.log.warn(`Internal error!`);
            return false;
        } else if (!resp) {
            this.adapter.log.warn(`Request error!`);
            return false;
        } else if (JSON.stringify(resp).indexOf("timeout") != -1) {
            this.adapter.log.warn(`Request error! - ${resp}`);
            return false;
        }
        if (request === "template" && typeof resp === "string") {
            resp = resp.replace(/applymask=/g, "mask=").replace(/<sub_templates \/>/g, "<subs_templates />");
        }
        try {
            this.config[`${request}_xml`] = resp;
            this.config[request] = parser.xml2json(resp);
            if (this.adapter.viewdebug) {
                this.adapter.log.debug(`fritzRequest: " ${JSON.stringify(this.config[request])}`);
            }
        } catch (e) {
            this.adapter.log.warn(`fritzRequest: ${e}`);
            return false;
        }
        if (this.adapter.viewdebug) {
            this.adapter.log.debug(JSON.stringify(this.config[request]));
        }
        return this.config[request];
    }

    async own_request(methode, url, data, value) {
        return await this.sendRequest(methode, `${url}${this.config.response_sid.SessionInfo.SID}`, data, value, false);
    }

    async sendRequest(methode, url, data, value, resp) {
        if (data == null) {
            data = "";
        }
        return await this.requestClient({
            method: methode,
            url: url,
            ...data,
        })
            .then(async res => {
                if (value) {
                    return res.data;
                }
                return res;
            })
            .catch(error => {
                if (error.response && error.response.status === 403) {
                    this.config.response_sid.SessionInfo.SID = "0000000000000000";
                    this.adapter.log.warn(
                        `Error - Session ID invalid or user not authorized! - ${this.config.response_sid.SessionInfo.SID}`,
                    );
                }
                if (resp) {
                    return error;
                }
                this.adapter.log.warn(`sendRequest: ${error}`);
                return false;
            });
    }

    async solveChallenge(challenge, options) {
        const challengeSplit = challenge.split("$");
        if (challengeSplit[0] === "2") {
            const iter1 = parseInt(challengeSplit[1]);
            const salt1 = this.parseHexToIntArray(challengeSplit[2]);
            const iter2 = parseInt(challengeSplit[3]);
            const salt2 = challengeSplit[4];
            const hash1 = crypto.pbkdf2Sync(options.password, salt1, iter1, 32, "sha256");
            const hash2 = crypto.pbkdf2Sync(hash1, this.parseHexToIntArray(salt2), iter2, 32, "sha256");
            return `${salt2}$${hash2.toString("hex").trim()}`;
        }
        const buffer = Buffer.from(`${challenge}-${options.password}`, "utf16le");
        return `${challenge}-${crypto.createHash("md5").update(buffer).digest("hex")}`;
    }

    parseHexToIntArray(hexNumber) {
        if (hexNumber.length % 2 !== 0) {
            this.adapter.log.warn("String has an invalid length for a hex string");
        }
        const intArray = [];
        for (let iIndex = 0; iIndex < hexNumber.length; iIndex += 2) {
            try {
                intArray.push(parseInt(hexNumber.substr(iIndex, 2), 16));
            } catch {
                this.adapter.log.warn("Invalid hex string");
            }
        }
        return new Uint8Array(intArray);
    }

    /**
     * @param {number} ms
     */
    sleep(ms) {
        return new Promise(resolve => {
            this.waiting = this.adapter.setTimeout(() => {
                resolve(true);
            }, ms);
        });
    }

    async loadMonitor() {
        const monitor = await this.requestClient({
            method: "POST",
            url: "/data.lua",
            data: { page: "netCnt", sid: this.config.response_sid.SessionInfo.SID },
        })
            .then(async res => {
                if (res.data) {
                    return res.data;
                }
                return res;
            })
            .catch(error => {
                return error;
            });
        const all = {};
        if (monitor != null && typeof monitor === "string" && monitor.indexOf("LastMonth") != -1) {
            const fullConst = monitor != null ? monitor.match("const data = (.*?);") : "";
            if (fullConst != null && fullConst[1] != null) {
                try {
                    const options = {
                        lowerCaseTagName: false,
                        comment: false,
                        voidTag: {
                            tags: [
                                "area",
                                "base",
                                "br",
                                "col",
                                "embed",
                                "hr",
                                "img",
                                "input",
                                "link",
                                "meta",
                                "param",
                                "source",
                                "track",
                                "wbr",
                            ],
                            closingSlash: true,
                        },
                        blockTextElements: {
                            script: true,
                            noscript: true,
                            style: true,
                            pre: true,
                        },
                    };
                    const root = HTMLParser.parse(monitor.toString().replace(/\n/g, ""), options);
                    const json = JSON.parse(fullConst[1]);
                    const all_array = [];
                    for (const val in json) {
                        all[val] = {
                            name: "",
                            time: "",
                            outgoing: 0,
                            incoming: 0,
                            total: 0,
                            connection: 0,
                            id: 0,
                        };
                        const time_val = root.querySelector(`#ui${val}`)?.toString();
                        if (time_val != null && typeof time_val === "string" && time_val != "") {
                            const time_state = time_val.match('class="time">(.*?)</td>');
                            if (time_state != null && time_state[1] != null) {
                                all[val].time = time_state[1];
                            }
                            const con_state = time_val.match('class="conn">(.*?)</td>');
                            if (con_state != null && con_state[1] != null) {
                                all[val].connection = parseInt(con_state[1]);
                            }
                            const first_state = time_val.match('class="first_col">(.*?)</td>');
                            if (first_state != null && first_state[1] != null) {
                                all[val].name = first_state[1];
                            }
                        }
                        const outgoing = this.combineBytes(json[val].BytesSentHigh, json[val].BytesSentLow);
                        const incoming = this.combineBytes(json[val].BytesReceivedHigh, json[val].BytesReceivedLow);
                        all[val].outgoing = this.convertToMB(outgoing);
                        all[val].incoming = this.convertToMB(incoming);
                        all[val].total = this.convertToMB(outgoing + incoming);
                        if (val === "Today") {
                            all[val].id = 1;
                        } else if (val === "Yesterday") {
                            all[val].id = 2;
                        } else if (val === "ThisWeek") {
                            all[val].id = 3;
                        } else if (val === "ThisMonth") {
                            all[val].id = 4;
                        } else if (val === "LastMonth") {
                            all[val].id = 5;
                        }
                        all_array.push(all[val]);
                    }
                    this.adapter.log.debug(JSON.stringify(json.LastMonth));
                    this.adapter.log.debug(JSON.stringify(json.ThisWeek));
                    this.adapter.log.debug(JSON.stringify(json.Today));
                    this.adapter.log.debug(JSON.stringify(json.Yesterday));
                    this.adapter.log.debug(JSON.stringify(json.ThisMonth));
                    await this.adapter.setState(`${this.config.dp}.TR_064.States.Traffic.fritz_monitor`, {
                        val: JSON.stringify(all),
                        ack: true,
                    });
                    all_array.sort((a, b) => a.id - b.id);
                    await this.adapter.setState(`${this.config.dp}.TR_064.States.Traffic.fritz_monitor_array`, {
                        val: JSON.stringify(all_array),
                        ack: true,
                    });
                } catch (e) {
                    this.adapter.log.info(`loadMonitor: ${e}`);
                }
            }
        }
        this.adapter.log.debug(monitor.toString());
    }

    combineBytes(high, low) {
        high = parseInt(high || "0", 10);
        low = parseInt(low || "0", 10);
        return high * 4294967296 + low;
    }

    convertToMB(num) {
        return Math.round(num / 1000000);
    }

    async sidCheck() {
        this.checkInterval = this.adapter.setInterval(
            async () => {
                if (this.restart) {
                    return;
                }
                if (this.isonunload) {
                    return;
                }
                this.check = true;
                const params = {
                    data: {
                        sid: this.config.response_sid.SessionInfo.SID,
                    },
                };
                const resp = await this.sendRequest("post", "/login_sid.lua?version=2", params, true, false);
                const sid = resp ? resp.match("<SID>(.*?)</SID>")[1] : "0000000000000000";
                this.adapter.log.debug(`SID CHECK: ${sid} - ${resp}`);
                if (sid === "0000000000000000") {
                    this.adapter.log.info("Check not successfully!");
                    const login = await this.login();
                    if (!login || login == "BLOCK") {
                        this.adapter.log.info("Login not successfully!");
                        const login = await this.login();
                        if (!login) {
                            this.adapter.log.info("Login not successfully! Next check in 10 Minutes.");
                            this.sid_status &&
                                (await this.adapter.setState("info.connection", { val: false, ack: true }));
                            this.sid_status = false;
                        } else {
                            this.adapter.log.info("Second check successful!");
                            !this.sid_status &&
                                (await this.adapter.setState("info.connection", { val: true, ack: true }));
                            this.sid_status = true;
                            this.resendCommand();
                        }
                    }
                } else {
                    this.adapter.log.info(`Check successfully! ${resp}`);
                    this.resendCommand();
                }
                this.check = false;
            },
            1000 * 60 * 10,
        );
    }

    async setDECTInterval() {
        this.infoInterval && this.adapter.clearTimeout(this.infoInterval);
        this.infoInterval = null;
        await this.sleep(200);
        this.infoInterval = this.adapter.setTimeout(() => {
            this.updateDECT();
        }, this.config.dect_interval * 1000);
    }

    async updateDECT() {
        if (this.isWork || this.check) {
            await this.adapter.setState(`${this.config.dp}.DECT_Control.interval`, {
                val: `WORK - ${this.isWork} - ${this.check}`,
                ack: true,
            });
            this.adapter.log.debug(`WORK - ${this.isWork} - ${this.check}`);
            this.setDECTInterval();
            return;
        }
        this.isWork = true;
        if (this.config.response_sid.SessionInfo.SID === "0000000000000000") {
            this.adapter.log.info(`setDECTInterval - Wrong SID!!!`);
            this.sid_status && (await this.adapter.setState("info.connection", { val: false, ack: true }));
            this.sid_status = false;
            this.check = true;
            this.relogin();
            return;
        }
        if (this.isonunload) {
            return;
        }
        const devices = await this.fritzRequest(
            "GET",
            "/webservices/homeautoswitch.lua?switchcmd=getdevicelistinfos&sid=",
            "device",
        );
        if (devices && devices.devicelist && devices.devicelist.device) {
            const dect = JSON.stringify(devices.devicelist.device);
            if (this.dect != dect) {
                this.dect = dect;
                await this.setStates(this.config, devices.devicelist.device, "DECT", this.channels_array);
                this.adapter.log.debug("Update DECT DONE");
                await this.adapter.setState(`${this.config.dp}.DECT_Control.interval`, {
                    val: "Update DECT DONE",
                    ack: true,
                });
            } else {
                await this.adapter.setState(`${this.config.dp}.DECT_Control.interval`, {
                    val: "No DECT update",
                    ack: true,
                });
                this.adapter.log.debug("No DECT update");
            }
        }
        if (devices && devices.devicelist && devices.devicelist.group) {
            const group = JSON.stringify(devices.devicelist.group);
            if (this.group != group) {
                this.group = group;
                await this.setStates(this.config, devices.devicelist.group, "GROUP", this.channels_array);
                this.adapter.log.debug("Update GROUP DONE");
            } else {
                this.adapter.log.debug("No GROUP update");
            }
        }
        this.isWork = false;
        this.setDECTInterval();
    }

    setTemplateInterval() {
        this.tempInterval && this.adapter.clearInterval(this.tempInterval);
        this.tempInterval = null;
        this.tempInterval = this.adapter.setInterval(async () => {
            if (this.check) {
                this.adapter.log.debug(`CHECK - ${this.isWork} - ${this.check}`);
                return;
            }
            this.isWork = true;
            if (this.config.response_sid.SessionInfo.SID === "0000000000000000") {
                this.adapter.log.info(`setTemplateInterval - Wrong SID!!!`);
                this.sid_status && (await this.adapter.setState("info.connection", { val: false, ack: true }));
                this.sid_status = false;
                this.check = true;
                this.relogin();
                return;
            }
            if (this.isonunload) {
                return;
            }
            const template = await this.fritzRequest(
                "GET",
                "/webservices/homeautoswitch.lua?switchcmd=gettemplatelistinfos&sid=",
                "template",
            );
            if (template && template.templatelist && template.templatelist.template) {
                const temp = JSON.stringify(template.templatelist.template);
                if (this.template != temp) {
                    this.template = temp;
                    await this.setStates(this.config, template.templatelist.template, "TEMPLATE", this.channels_array);
                    this.adapter.log.debug("Update Templates DONE");
                } else {
                    this.adapter.log.debug("No Template update");
                }
            }
            if (this.isonunload) {
                return;
            }
            const trigger = await this.fritzRequest(
                "GET",
                "/webservices/homeautoswitch.lua?switchcmd=gettriggerlistinfos&sid=",
                "trigger",
            );
            if (trigger && trigger.triggerlist && trigger.triggerlist.trigger) {
                const triggers = JSON.stringify(trigger.triggerlist.trigger);
                if (this.trigger != triggers) {
                    this.trigger = triggers;
                    await this.setStates(this.config, trigger.triggerlist.trigger, "TRIGGER", this.channels_array);
                    this.adapter.log.debug("Update Triggers DONE");
                } else {
                    this.adapter.log.debug("No Trigger update");
                }
            }
            this.isWork = false;
        }, this.config.temp_interval * 1000);
    }

    async start() {
        await this.sleep(6000);
        this.sidCheck();
        this.sid_status = true;
        const channels = await this.adapter.getChannelsAsync();
        this.channels_array = channels.map(entry => entry._id);
        this.setDECTInterval();
        if (this.config.temp_interval > 0) {
            this.setTemplateInterval();
        }
    }

    async setStates(id, devices, dp_name, channels_array) {
        const namespace = this.adapter.namespace;
        let device_array = [];
        if (Object.keys(devices).length == 0) {
            return;
        } else if (Object.keys(devices).length == 1) {
            device_array.push(devices);
        } else {
            device_array = devices;
        }
        for (const device of device_array) {
            if (this.isonunload) {
                break;
            }
            let dp = "";
            let val = "";
            if (device.functionbitmask != 1) {
                if (this.mask[device.functionbitmask]) {
                    device.functionbitmask = this.mask[device.functionbitmask];
                } else if (device.functionbitmask != null) {
                    const functionbitmask = device.functionbitmask;
                    device.functionbitmask = `${device.functionbitmask} - ${this.adapter.getmask(
                        device.functionbitmask,
                    )}`;
                    this.mask[functionbitmask] = device.functionbitmask;
                }
                if (device.productname === "FRITZ!DECT 500") {
                    let hex = "#000000";
                    const h = device.colorcontrol.hue;
                    const s = Math.round((device.colorcontrol.saturation / 255) * 100);
                    const v = Math.round((device.colorcontrol.unmapped_saturation / 255) * 100);
                    if (device.colorcontrol.hue != -1) {
                        hex = this.adapter.hsvToHex(h, s, v);
                    }
                    device.colorcontrol.hex = hex.toUpperCase();
                }
                const ident = `${dp_name}_${device.identifier.replace(/\s/g, "").replace(/-1/g, "")}`;
                if (!channels_array.includes(`${namespace}.${id.dp}.${ident}`)) {
                    this.adapter.log.info(`Cannot found channel - ${namespace}.${id.dp}.${ident}`);
                    this.emit("dect", id.dp, dp_name, devices);
                    await this.adapter.sleep(1000);
                    continue;
                }
                for (const key in device) {
                    if (this.isonunload) {
                        break;
                    }
                    if (typeof device[key] === "object") {
                        if (!Array.isArray(device[key])) {
                            for (const subkey in device[key]) {
                                if (typeof device[key][subkey] === "object") {
                                    if (subkey === "device" && Array.isArray(device[key][subkey])) {
                                        for (const subsubkey in device[key][subkey]) {
                                            for (const dubkey in device[key][subkey][subsubkey]) {
                                                dp = `${id.dp}.${ident}.${key}.${subkey}.${dubkey}${subsubkey}`;
                                                val = JSON.stringify(device[key][subkey][subsubkey][dubkey]);
                                                if (!this.lastValue[dp] || this.lastValue[dp] != val) {
                                                    this.lastValue[dp] = val;
                                                    await this.adapter.setState(dp, {
                                                        val: device[key][subkey][subsubkey][dubkey],
                                                        ack: true,
                                                    });
                                                }
                                            }
                                        }
                                    } else {
                                        for (const subsubkey in device[key][subkey]) {
                                            dp = `${id.dp}.${ident}.${key}.${subkey}.${subsubkey}`;
                                            val = JSON.stringify(device[key][subkey][subsubkey]);
                                            if (!this.lastValue[dp] || this.lastValue[dp] != val) {
                                                this.lastValue[dp] = val;
                                                await this.adapter.setState(dp, {
                                                    val: device[key][subkey][subsubkey],
                                                    ack: true,
                                                });
                                            }
                                        }
                                    }
                                } else {
                                    dp = `${id.dp}.${ident}.${key}.${subkey}`;
                                    val = JSON.stringify(device[key][subkey]);
                                    if (!this.lastValue[dp] || this.lastValue[dp] != val) {
                                        this.lastValue[dp] = val;
                                        if (subkey === "interfaces") {
                                            device[key][subkey] = this.adapter.getinterfaces(device[key][subkey]);
                                        }
                                        await this.adapter.setState(dp, { val: device[key][subkey], ack: true });
                                    }
                                }
                            }
                        } else {
                            for (const button of device[key]) {
                                const ident_button = button.identifier.replace(/\s/g, "");
                                for (const keys in button) {
                                    if (this.isonunload) {
                                        break;
                                    }
                                    dp = `${id.dp}.${ident}.${key}.${ident_button}.${keys}`;
                                    val = JSON.stringify(button[keys]);
                                    if (!this.lastValue[dp] || this.lastValue[dp] != val) {
                                        this.lastValue[dp] = val;
                                        await this.adapter.setState(dp, { val: button[keys], ack: true });
                                    }
                                }
                            }
                        }
                    } else {
                        dp = `${id.dp}.${ident}.${key}`;
                        val = JSON.stringify(device[key]);
                        if (!this.lastValue[dp] || this.lastValue[dp] != val) {
                            this.lastValue[dp] = val;
                            await this.adapter.setState(dp, { val: device[key], ack: true });
                        }
                        if (key === "present") {
                            this.emit("status", id.dp, ident, device[key]);
                        }
                    }
                }
            } else {
                if (dp_name === "TRIGGER") {
                    const ident = `${dp_name}_${device.identifier.replace(/\s/g, "").replace(/-1/g, "")}`;
                    for (const key in device) {
                        if (this.isonunload) {
                            break;
                        }
                        for (const subkey in device[key]) {
                            if (this.isonunload) {
                                break;
                            }
                            dp = `${id.dp}.${ident}.${key}.${subkey}`;
                            val = JSON.stringify(device[key][subkey]);
                            if (!this.lastValue[dp] || this.lastValue[dp] != val) {
                                this.lastValue[dp] = val;
                                await this.adapter.setState(dp, { val: device[key][subkey], ack: true });
                            }
                        }
                    }
                }
            }
        }
    }

    async setDP(sid, online) {
        await this.adapter.setState(`${this.config.dp}.DECT_Control.sid`, { val: sid, ack: true });
        await this.adapter.setState(`${this.config.dp}.DECT_Control.sid_create`, { val: Date.now(), ack: true });
        await this.adapter.setState(`${this.config.dp}.DECT_Control.online`, { val: online, ack: true });
    }

    async destroy() {
        this.isonunload = true;
        this.check = true;
        this.setDP("0000000000000000", false);
        this.sid_status && (await this.adapter.setState("info.connection", { val: false, ack: true }));
        this.sid_status = false;
        this.waiting && this.adapter.clearTimeout(this.waiting);
        this.checkInterval && this.adapter.clearInterval(this.checkInterval);
        this.infoInterval && this.adapter.clearTimeout(this.infoInterval);
        this.tempInterval && this.adapter.clearInterval(this.tempInterval);
        this.restart && this.adapter.clearInterval(this.restart);
        this.tempInterval = null;
        this.restart = null;
        this.waiting = null;
        this.infoInterval = null;
        this.checkInterval = null;
        if (
            !this.config.response_sid ||
            !this.config.response_sid.SessionInfo ||
            this.config.response_sid.SessionInfo.SID == null ||
            this.config.response_sid.SessionInfo.SID === "0000000000000000"
        ) {
            const params = {
                data: {
                    logout: "logout",
                    sid: this.config.response_sid.SessionInfo.SID,
                },
            };
            const resp = await this.sendRequest("post", "/login_sid.lua?version=2", params, true, false);
            const sid = resp ? resp.match("<SID>(.*?)</SID>")[1] : "0000000000000000";
            if (sid === "0000000000000000") {
                this.adapter.log.info("Logout successfully!");
            } else {
                this.adapter.log.info("Logout not successfully!");
            }
        }
    }
}

module.exports = Fritzbox;
