const EventEmitter = require("events");
const util = require("util");
const QRCode = require("qrcode");
const exec = util.promisify(require("child_process").exec);
const xml2js = require("xml2js");
const entities = require("entities");
const axios = require("axios");
const https = require("https");
const http = require("http");
const request = require("./request");
const httpsAgent = new https.Agent({
    rejectUnauthorized: false,
});
const wpaKeys = {
    None: "",
    WPA: "WPA",
    "11i": "WPA2",
    WPAand11i: "WPA + WPA2",
    "11iandWPA3": "WPA2 + WPA3",
};

class TR064 extends EventEmitter {
    constructor(config, adapter) {
        super();
        this.adapter = adapter;
        this.wlanCount = 0;
        this.config = config;
        this.updateInterval = null;
        this.services = [];
        this.sslport = 0;
        this.rights = {
            user: "unknown",
            boxAdmin: "X",
            phone: "X",
            dial: "X",
            nas: "X",
            homeAuto: "X",
            app: "X",
            unknown: "-",
        };
        this.checkvalue = {};
        this.parser = new xml2js.Parser({
            explicitArray: false,
            mergeAttrs: true,
            normalizeTags: true,
            ignoreAttrs: true,
        });
        const data = {};
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

    async start() {
        let commandURL = await this.requestClient({
            method: "GET",
            url: "/tr64desc.xml",
            baseURL: `${this.config.protocol}://${this.config.ip}:49000`,
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
        this.updateInterval && this.adapter.clearInterval(this.updateInterval);
        if (commandURL != null && typeof commandURL === "string" && commandURL.indexOf("serviceList") != -1) {
            commandURL = commandURL.toString().replace(/\n/g, "");
            await this.parser
                .parseStringPromise(commandURL)
                .then(result => {
                    this.adapter.log.debug(`tr64desc: ${JSON.stringify(result)}`);
                    this.services = this.services.concat(this.objectToPaths(result));
                    return true;
                })
                .catch(err => {
                    this.adapter.log.warn(err);
                    return false;
                });
            commandURL = await this.requestClient({
                method: "GET",
                url: "/igddesc.xml",
                baseURL: `${this.config.protocol}://${this.config.ip}:49000`,
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
            if (commandURL != null && typeof commandURL === "string" && commandURL.indexOf("serviceList") != -1) {
                commandURL = commandURL.toString().replace(/\n/g, "");
                await this.parser
                    .parseStringPromise(commandURL)
                    .then(result => {
                        this.adapter.log.debug(`igddesc: ${JSON.stringify(result)}`);
                        this.services = this.services.concat(this.objectToPaths(result));
                        return true;
                    })
                    .catch(err => {
                        this.adapter.log.warn(err);
                        return false;
                    });
            }
            commandURL = "";
            if (this.services.length > 0) {
                for (const service of this.services) {
                    service.rigths = this.rigthsCheck(service.servicetype, null);
                }
                await this.adapter.setState(`${this.config.dp}.TR_064.States.sendCommandPossible`, {
                    val: JSON.stringify(this.services),
                    ack: true,
                });
            }
            const wlan = {
                link: "/upnp/control/wlanconfig",
                service: "urn:dslforum-org:service:WLANConfiguration:",
                action: "GetInfo",
            };
            this.wlanCount = 0;
            for (let i = 1; i < 6; i++) {
                const wlan_resp = await this.requests(`${wlan.link}${i}`, `${wlan.service}${i}`, `${wlan.action}`, "");
                if (wlan_resp != null && typeof wlan_resp === "string" && wlan_resp.indexOf("NewEnable") != -1) {
                    ++this.wlanCount;
                    if (this.wlanCount === 4) {
                        await this.createWlanStates("6.0", "60");
                    }
                    if (this.wlanCount === 5) {
                        await this.createWlanStates("7.0", "70");
                    }
                }
            }
            // ToDo create states for 5GHz ch2 anf Wifi 7
            await this.updateEnergy();
            await this.updateTR064Byte();
            await this.updateTR064();
            await this.updateTR064Wlan();
            if (this.config.tr_interval > 0) {
                this.adapter.log.info(`Start TR-064 interval with ${this.config.tr_interval} Minute(s)`);
                this.startupdateTR064();
            }
        }
    }

    async createWlanStates(ghz, ghz_dp) {
        let common = {};
        common = {
            name: {
                en: `WiFi ${ghz} GHz`,
                de: `WLAN ${ghz} GHz`,
                ru: `WiFi ${ghz} ГГц`,
                pt: `WiFi ${ghz} GHz`,
                nl: `WiFi ${ghz} GHz`,
                fr: `WiFi ${ghz} GHz`,
                it: `WiFi ${ghz} GHz`,
                es: `WiFi ${ghz} GHz`,
                pl: `WiFi ${ghz} GHz`,
                uk: `WiFi ${ghz} ГГц`,
                "zh-cn": `WiFi ${ghz} 千兆赫`,
            },
            type: "boolean",
            role: "switch",
            desc: `WiFi ${ghz} GHz`,
            read: true,
            write: true,
            def: false,
        };
        await this.adapter.createDataPoint(`${this.config.dp}.TR_064.States.wlan${ghz_dp}`, common, "state", null);
        common = {
            name: {
                en: `Set new Wifi ${ghz} GHz password`,
                de: `Neues Wifi ${ghz} GHz Passwort setzen`,
                ru: `Набрать новый пароль Wifi ${ghz} ГГц`,
                pt: `Definir nova senha Wifi ${ghz} GHz`,
                nl: `Nieuw Wifi ${ghz} GHz-wachtwoord instellen`,
                fr: `Définir un nouveau mot de passe Wifi ${ghz} GHz`,
                it: `Impostare la nuova password Wifi ${ghz} GHz`,
                es: `Establecer nueva contraseña Wifi ${ghz} GHz`,
                pl: `Ustaw nowe hasło Wifi ${ghz} GHz`,
                uk: `Встановіть новий пароль Wifi ${ghz} GHz`,
                "zh-cn": `设置新的 Wifi ${ghz} GHz 密码`,
            },
            type: "string",
            role: "state",
            desc: `Set new Wifi ${ghz} GHz password`,
            read: true,
            write: true,
            def: "",
        };
        await this.adapter.createDataPoint(`${this.config.dp}.TR_064.States.wlan${ghz_dp}PW`, common, "state", null);
        common = {
            name: {
                en: `Set new Wifi ${ghz} GHz name`,
                de: `Neue Wifi ${ghz} GHz Namen setzen`,
                ru: `Установить новое имя Wifi ${ghz} ГГц`,
                pt: `Definir novo nome Wifi ${ghz} GHz`,
                nl: `Nieuwe Wifi ${ghz} GHz-naam instellen`,
                fr: `Définir un nouveau nom Wifi ${ghz} GHz`,
                it: `Impostare il nuovo nome Wifi ${ghz} GHz`,
                es: `Nuevo nombre Wifi ${ghz} GHz`,
                pl: `Ustaw nową nazwę Wifi ${ghz} GHz`,
                uk: `Встановіть новий Wifi ${ghz} GHz`,
                "zh-cn": `设置新的 Wifi ${ghz} GHz 名称`,
            },
            type: "string",
            role: "state",
            desc: `Set new Wifi ${ghz} GHz name`,
            read: true,
            write: true,
            def: "",
        };
        await this.adapter.createDataPoint(`${this.config.dp}.TR_064.States.wlan${ghz_dp}name`, common, "state", null);
        common = {
            name: {
                en: `Wifi ${ghz} QRCode`,
                de: `Wifi ${ghz} QRCode`,
                ru: `Wifi ${ghz} QRCode`,
                pt: `Wifi ${ghz} QRCode`,
                nl: `Wifi ${ghz} QRCode`,
                fr: `Wifi ${ghz} QRCode`,
                it: `Wifi ${ghz} QRCode`,
                es: `Wifi ${ghz} QRCode`,
                pl: `Wifi ${ghz} QRCode`,
                uk: `Wifi ${ghz} QRCode`,
                "zh-cn": `维菲 ${ghz} QRCode`,
            },
            type: "string",
            role: "state",
            desc: `Wifi ${ghz} QRCode`,
            read: true,
            write: false,
            def: "",
        };
        await this.adapter.createDataPoint(
            `${this.config.dp}.TR_064.States.wlan${ghz_dp}QRCode`,
            common,
            "state",
            null,
        );
    }

    setWlan(configId, state) {
        const qr = configId;
        if (configId === 5) {
            configId = this.wlanCount;
        }
        const wlan = {
            service: `urn:dslforum-org:service:WLANConfiguration:${configId}`,
            action: "SetEnable",
            params: {
                NewEnable: state ? "1" : "0",
            },
            html: true,
            tag: "",
            link: "",
        };
        this.sendCommand(this.config.dp, JSON.stringify(wlan), null, qr);
    }

    setWlanName(configId, state) {
        const qr = configId;
        if (configId === 5) {
            configId = this.wlanCount;
        }
        const wlan = {
            service: `urn:dslforum-org:service:WLANConfiguration:${configId}`,
            action: "SetSSID",
            params: {
                NewSSID: state,
            },
            html: true,
            tag: "",
            link: "",
        };
        this.sendCommand(this.config.dp, JSON.stringify(wlan), null, qr);
    }

    setWlanPW(configId, state) {
        const qr = configId;
        if (configId === 5) {
            configId = this.wlanCount;
        }
        const wlan = {
            service: `urn:dslforum-org:service:WLANConfiguration:${configId}`,
            action: "SetSecurityKeys",
            params: {
                NewKeyPassphrase: state,
            },
            html: true,
            tag: "",
            link: "",
        };
        this.sendCommand(this.config.dp, JSON.stringify(wlan), null, qr);
    }

    async setQRCode(qrcode) {
        const dp_qr = {
            1: `${this.config.dp}.TR_064.States.wlan24QRCode`,
            2: `${this.config.dp}.TR_064.States.wlan50QRCode`,
            3: `${this.config.dp}.TR_064.States.wlan60QRCode`,
            4: `${this.config.dp}.TR_064.States.wlan70QRCode`,
            5: `${this.config.dp}.TR_064.States.wlanguestQRCode`,
        };
        const wlan = {
            link: "/upnp/control/wlanconfig",
            service: "urn:dslforum-org:service:WLANConfiguration:",
            action: "GetInfo",
        };
        let ssid = "";
        let pw = "";
        let wpa = "";
        const wlan_resp = await this.requests(
            `${wlan.link}${qrcode}`,
            `${wlan.service}${qrcode}`,
            `${wlan.action}`,
            "",
        );
        if (wlan_resp != null && typeof wlan_resp === "string" && wlan_resp.indexOf("NewEnable") != -1) {
            const wlan_g_name = wlan_resp.match("<NewSSID>(.*?)</NewSSID>");
            if (wlan_g_name != null && wlan_g_name[1] != null) {
                ssid = wlan_g_name[1];
            }
            const wlan_secure = await this.requests(
                `${wlan.link}${qrcode}`,
                `${wlan.service}${qrcode}`,
                "GetSecurityKeys",
                "",
            );
            if (
                wlan_secure != null &&
                typeof wlan_secure === "string" &&
                wlan_secure.indexOf("NewKeyPassphrase") != -1
            ) {
                const wlan_pw = wlan_secure.match("<NewKeyPassphrase>(.*?)</NewKeyPassphrase>");
                if (wlan_pw != null && wlan_pw[1] != null) {
                    pw = wlan_pw[1];
                }
            }
            if (wlan_resp != null && typeof wlan_resp === "string" && wlan_resp.indexOf("NewBeaconType") != -1) {
                const wlan_wpa = wlan_resp.match("<NewBeaconType>(.*?)</NewBeaconType>");
                if (wlan_wpa != null && wlan_wpa[1] != null) {
                    wpa = wlan_wpa[1];
                }
            }
            if (wpa != "" && pw != "" && ssid != "") {
                const svg_string = await QRCode.toString(`WIFI:S:${ssid};T:${wpaKeys[wpa]};P:${pw};H:false;`, {
                    type: "svg",
                    width: 100,
                });
                await this.adapter.setState(dp_qr[qrcode], { val: svg_string, ack: true });
            }
        }
    }

    objectToPaths(data) {
        const validId = /^[a-z_$][a-z0-9_$]*$/i;
        let service = [];
        doIt(data);
        return service;
        function doIt(data) {
            if (data && typeof data === "object") {
                if (Array.isArray(data)) {
                    for (let i = 0; i < data.length; i++) {
                        doIt(data[i]);
                    }
                } else {
                    for (const p in data) {
                        if (validId.test(p)) {
                            if (p === "service") {
                                if (Array.isArray(data[p])) {
                                    service = service.concat(data[p]);
                                } else {
                                    service.push(data[p]);
                                }
                            } else {
                                doIt(data[p]);
                            }
                        } else {
                            doIt(data[p]);
                        }
                    }
                }
            }
        }
    }

    async startupdateTR064() {
        this.updateInterval = this.adapter.setInterval(
            async () => {
                await this.updateEnergy();
                await this.updateTR064Byte();
                await this.updateTR064();
                await this.updateTR064Wlan();
            },
            60 * this.config.tr_interval * 1000,
        );
    }

    async updateEnergy() {
        let state = "";
        const ecoStat = await this.requestClient({
            method: "POST",
            url: "/data.lua",
            data: { page: "ecoStat", sid: this.config.response_sid.SessionInfo.SID },
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
        if (ecoStat && ecoStat.data) {
            let eco = "";
            if (ecoStat.data.cputemp && ecoStat.data.cpuutil.series) {
                state = `${this.config.dp}.TR_064.States.Energy.cpu_usage`;
                eco = JSON.stringify(ecoStat.data.cpuutil.series);
                if (!this.checkvalue[state] || this.checkvalue[state] != eco) {
                    this.checkvalue[state] = eco;
                    await this.adapter.setState(state, { val: eco, ack: true });
                }
                state = `${this.config.dp}.TR_064.States.Energy.cpu_usage_scale`;
                eco = JSON.stringify(ecoStat.data.cputemp.labels);
                if (!this.checkvalue[state] || this.checkvalue[state] != eco) {
                    this.checkvalue[state] = eco;
                    await this.adapter.setState(state, { val: eco, ack: true });
                }
            }
            if (ecoStat.data.cputemp && ecoStat.data.cputemp.series) {
                state = `${this.config.dp}.TR_064.States.Energy.cpu_temperature`;
                eco = JSON.stringify(ecoStat.data.cputemp.series);
                if (!this.checkvalue[state] || this.checkvalue[state] != eco) {
                    this.checkvalue[state] = eco;
                    await this.adapter.setState(state, { val: eco, ack: true });
                }
            }
            if (ecoStat.data.cputemp && ecoStat.data.ramusage.series) {
                state = `${this.config.dp}.TR_064.States.Energy.ram_usage`;
                eco = JSON.stringify(ecoStat.data.ramusage.series);
                if (!this.checkvalue[state] || this.checkvalue[state] != eco) {
                    this.checkvalue[state] = eco;
                    await this.adapter.setState(state, { val: eco, ack: true });
                }
                state = `${this.config.dp}.TR_064.States.Energy.ram_usage_scale`;
                eco = JSON.stringify(ecoStat.data.ramusage.labels);
                if (!this.checkvalue[state] || this.checkvalue[state] != eco) {
                    this.checkvalue[state] = eco;
                    await this.adapter.setState(state, { val: eco, ack: true });
                }
            }
        } else {
            this.adapter.log.warn(`Error EcoState: ${ecoStat}`);
        }
        const energy = await this.requestClient({
            method: "POST",
            url: "/data.lua",
            data: { page: "energy", sid: this.config.response_sid.SessionInfo.SID },
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
        if (energy && energy.data && energy.data.drain && Array.isArray(energy.data.drain)) {
            const dp = [
                "total_currently",
                "total_last24h",
                "main_currently",
                "main_last24h",
                "wifi_currently",
                "wifi_last24h",
                "conn_currently",
                "conn_last24h",
                "fon_currently",
                "fon_last24h",
                "usb_currently",
                "usb_last24h",
            ];
            let count = 0;
            for (const val of energy.data.drain) {
                if (dp[count] != null) {
                    state = `${this.config.dp}.TR_064.States.Energy.${dp[count]}`;
                    if (!this.checkvalue[state] || this.checkvalue[state] != val.cumPerc) {
                        this.checkvalue[state] = val.cumPerc;
                        await this.adapter.setState(state, { val: parseInt(val.cumPerc), ack: true });
                    }
                    ++count;
                    state = `${this.config.dp}.TR_064.States.Energy.${dp[count]}`;
                    if (!this.checkvalue[state] || this.checkvalue[state] != val.actPerc) {
                        this.checkvalue[state] = val.actPerc;
                        await this.adapter.setState(state, { val: parseInt(val.actPerc), ack: true });
                    }
                    ++count;
                }
                if (val && val.lan && Array.isArray(val.lan)) {
                    for (const fon of val.lan) {
                        const name = fon.name != null ? fon.name.toLowerCase().replace(/ /g, "") : "";
                        if (name != "") {
                            state = `${this.config.dp}.TR_064.States.Energy.${name}`;
                            if (!this.checkvalue[state] || this.checkvalue[state] != fon.class) {
                                this.checkvalue[state] = fon.class;
                                await this.adapter.setState(state, { val: fon.class != "" ? true : false, ack: true });
                            }
                        }
                    }
                }
            }
        } else if (energy && energy.data && energy.data.fiber) {
            this.adapter.log.debug(`in progress!!!`);
        } else {
            this.adapter.log.warn(`Error energy: ${JSON.stringify(energy)}`);
        }
    }

    async updateTR064Byte() {
        let data = await this.requests(
            "/upnp/control/wancommonifconfig1",
            "urn:dslforum-org:service:WANCommonInterfaceConfig:1",
            "X_AVM-DE_GetOnlineMonitor",
            "<NewSyncGroupIndex>0</NewSyncGroupIndex>",
        );
        let state = "";
        await this.parser
            .parseStringPromise(data)
            .then(async result => {
                this.adapter.log.debug(`RESULTMONITOR: ${JSON.stringify(result)}`);
                if (
                    result &&
                    result["s:envelope"] &&
                    result["s:envelope"]["s:body"] &&
                    result["s:envelope"]["s:body"]["u:x_avm-de_getonlinemonitorresponse"]
                ) {
                    const val = result["s:envelope"]["s:body"]["u:x_avm-de_getonlinemonitorresponse"];
                    state = `${this.config.dp}.TR_064.States.Traffic.groupmode`;
                    if (val.newsyncgroupmode) {
                        if (!this.checkvalue[state] || this.checkvalue[state] != val.newsyncgroupmode) {
                            this.checkvalue[state] = val.newsyncgroupmode;
                            await this.adapter.setState(state, val.newsyncgroupmode, true);
                        }
                    }
                    state = `${this.config.dp}.TR_064.States.Traffic.newds_current_bps`;
                    if (val.newds_current_bps) {
                        if (!this.checkvalue[state] || this.checkvalue[state] != val.newds_current_bps) {
                            this.checkvalue[state] = val.newds_current_bps;
                            await this.adapter.setState(state, {
                                val: JSON.stringify(val.newds_current_bps.split(",")),
                                ack: true,
                            });
                        }
                    }
                    state = `${this.config.dp}.TR_064.States.Traffic.newmc_current_bps`;
                    if (val.newmc_current_bps) {
                        if (!this.checkvalue[state] || this.checkvalue[state] != val.newmc_current_bps) {
                            this.checkvalue[state] = val.newmc_current_bps;
                            await this.adapter.setState(state, {
                                val: JSON.stringify(val.newmc_current_bps.split(",")),
                                ack: true,
                            });
                        }
                    }
                    state = `${this.config.dp}.TR_064.States.Traffic.newus_current_bps`;
                    if (val.newus_current_bps) {
                        if (!this.checkvalue[state] || this.checkvalue[state] != val.newus_current_bps) {
                            this.checkvalue[state] = val.newus_current_bps;
                            await this.adapter.setState(state, {
                                val: JSON.stringify(val.newus_current_bps.split(",")),
                                ack: true,
                            });
                        }
                    }
                    state = `${this.config.dp}.TR_064.States.Traffic.newprio_realtime_bps`;
                    if (val.newprio_realtime_bps) {
                        if (!this.checkvalue[state] || this.checkvalue[state] != val.newprio_realtime_bps) {
                            this.checkvalue[state] = val.newprio_realtime_bps;
                            await this.adapter.setState(state, {
                                val: JSON.stringify(val.newprio_realtime_bps.split(",")),
                                ack: true,
                            });
                        }
                    }
                    state = `${this.config.dp}.TR_064.States.Traffic.newprio_high_bps`;
                    if (val.newprio_high_bps) {
                        if (!this.checkvalue[state] || this.checkvalue[state] != val.newprio_high_bps) {
                            this.checkvalue[state] = val.newprio_high_bps;
                            await this.adapter.setState(state, {
                                val: JSON.stringify(val.newprio_high_bps.split(",")),
                                ack: true,
                            });
                        }
                    }
                    state = `${this.config.dp}.TR_064.States.Traffic.newprio_default_bps`;
                    if (val.newprio_default_bps) {
                        if (!this.checkvalue[state] || this.checkvalue[state] != val.newprio_default_bps) {
                            this.checkvalue[state] = val.newprio_default_bps;
                            await this.adapter.setState(state, {
                                val: JSON.stringify(val.newprio_default_bps.split(",")),
                                ack: true,
                            });
                        }
                    }
                    state = `${this.config.dp}.TR_064.States.Traffic.newprio_low_bps`;
                    if (val.newprio_low_bps) {
                        if (!this.checkvalue[state] || this.checkvalue[state] != val.newprio_low_bps) {
                            this.checkvalue[state] = val.newprio_low_bps;
                            await this.adapter.setState(state, {
                                val: JSON.stringify(val.newprio_low_bps.split(",")),
                                ack: true,
                            });
                        }
                    }
                }
                return true;
            })
            .catch(err => {
                this.adapter.log.warn(err);
                return false;
            });
        const options_axios = action => {
            return {
                protocol: this.config.protocol,
                ip: this.config.ip,
                url: "/upnp/control/wancommonifconfig1",
                header: { SoapAction: `urn:dslforum-org:service:WANCommonInterfaceConfig:1#${action}` },
                publicKey: this.config.user,
                privateKey: this.config.password,
                method: "POST",
                data:
                    '<?xml version="1.0" encoding="utf-8"?>' +
                    '<s:Envelope s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"' +
                    '    xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">' +
                    "<s:Body>" +
                    `<u:${action} xmlns:u="urn:dslforum-org:service:WANCommonInterfaceConfig:1">` +
                    `</u:${action}></s:Body></s:Envelope>`,
            };
        };
        data = await request(options_axios("GetCommonLinkProperties"));
        await this.parser
            .parseStringPromise(data)
            .then(async result => {
                this.adapter.log.debug(`RESULTCOMMON: ${JSON.stringify(result)}`);
                if (
                    result &&
                    result["s:envelope"] &&
                    result["s:envelope"]["s:body"] &&
                    result["s:envelope"]["s:body"]["u:getcommonlinkpropertiesresponse"]
                ) {
                    const val = result["s:envelope"]["s:body"]["u:getcommonlinkpropertiesresponse"];
                    state = `${this.config.dp}.TR_064.States.Traffic.accesstype`;
                    if (val.newwanaccesstype) {
                        if (!this.checkvalue[state] || this.checkvalue[state] != val.newwanaccesstype) {
                            this.checkvalue[state] = val.newwanaccesstype;
                            await this.adapter.setState(state, { val: val.newwanaccesstype, ack: true });
                        }
                    }
                    state = `${this.config.dp}.TR_064.States.Traffic.upload`;
                    if (val.newlayer1upstreammaxbitrate) {
                        if (!this.checkvalue[state] || this.checkvalue[state] != val.newlayer1upstreammaxbitrate) {
                            this.checkvalue[state] = val.newlayer1upstreammaxbitrate;
                            const mu = (val.newlayer1upstreammaxbitrate / 1024 / 1024).toFixed(2);
                            await this.adapter.setState(state, { val: parseFloat(mu), ack: true });
                        }
                    }
                    state = `${this.config.dp}.TR_064.States.Traffic.download`;
                    if (val.newlayer1downstreammaxbitrate) {
                        if (!this.checkvalue[state] || this.checkvalue[state] != val.newlayer1downstreammaxbitrate) {
                            this.checkvalue[state] = val.newlayer1downstreammaxbitrate;
                            const md = (val.newlayer1downstreammaxbitrate / 1024 / 1024).toFixed(2);
                            await this.adapter.setState(state, { val: parseFloat(md), ack: true });
                        }
                    }
                }
                return true;
            })
            .catch(err => {
                this.adapter.log.warn(err);
                return false;
            });
        let link = "";
        let value;
        data = await request(options_axios("GetTotalBytesSent"));
        if (data != null && typeof data === "string" && data.indexOf("NewTotalBytesSent") != -1) {
            const sentByte_status = data.match("<NewTotalBytesSent>(.*?)</NewTotalBytesSent>");
            if (sentByte_status != null && sentByte_status[1] != null) {
                link = `${this.config.dp}.TR_064.States.Traffic.gettotalByteSent`;
                if (!this.checkvalue[link] || this.checkvalue[link] != sentByte_status[1]) {
                    this.checkvalue[link] = sentByte_status[1];
                    value = (parseInt(sentByte_status[1]) / Math.pow(10, 6)).toFixed(2);
                    await this.adapter.setState(link, { val: parseFloat(value), ack: true });
                }
            }
        }
        data = await request(options_axios("GetTotalBytesReceived"));
        if (data != null && typeof data === "string" && data.indexOf("NewTotalBytesReceived") != -1) {
            const receiveByte_status = data.match("<NewTotalBytesReceived>(.*?)</NewTotalBytesReceived>");
            if (receiveByte_status != null && receiveByte_status[1] != null) {
                link = `${this.config.dp}.TR_064.States.Traffic.gettotalByteReceive`;
                if (!this.checkvalue[link] || this.checkvalue[link] != receiveByte_status[1]) {
                    this.checkvalue[link] = receiveByte_status[1];
                    value = (parseInt(receiveByte_status[1]) / Math.pow(10, 6)).toFixed(2);
                    await this.adapter.setState(link, { val: parseFloat(value), ack: true });
                }
            }
        }
        data = await request(options_axios("GetTotalPacketsSent"));
        if (data != null && typeof data === "string" && data.indexOf("NewTotalPacketsSent") != -1) {
            const sentPacket_status = data.match("<NewTotalPacketsSent>(.*?)</NewTotalPacketsSent>");
            if (sentPacket_status != null && sentPacket_status[1] != null) {
                link = `${this.config.dp}.TR_064.States.Traffic.gettotalPacketsSent`;
                if (!this.checkvalue[link] || this.checkvalue[link] != sentPacket_status[1]) {
                    this.checkvalue[link] = sentPacket_status[1];
                    value = (parseInt(sentPacket_status[1]) / Math.pow(10, 6)).toFixed(2);
                    await this.adapter.setState(link, { val: parseFloat(value), ack: true });
                }
            }
        }
        data = await request(options_axios("GetTotalPacketsReceived"));
        if (data != null && typeof data === "string" && data.indexOf("NewTotalPacketsReceived") != -1) {
            const receivePacket_status = data.match("<NewTotalPacketsReceived>(.*?)</NewTotalPacketsReceived>");
            if (receivePacket_status != null && receivePacket_status[1] != null) {
                link = `${this.config.dp}.TR_064.States.Traffic.gettotalPacketsReceive`;
                if (!this.checkvalue[link] || this.checkvalue[link] != receivePacket_status[1]) {
                    this.checkvalue[link] = receivePacket_status[1];
                    value = (parseInt(receivePacket_status[1]) / Math.pow(10, 6)).toFixed(2);
                    await this.adapter.setState(link, { val: parseFloat(value), ack: true });
                }
            }
        }
    }

    async updateTR064Wlan() {
        const wlan = {
            link: "/upnp/control/wlanconfig",
            service: "urn:dslforum-org:service:WLANConfiguration:",
            action: "GetInfo",
        };
        const dp = {
            1: `${this.config.dp}.TR_064.States.wlan24`,
            2: `${this.config.dp}.TR_064.States.wlan50`,
            3: `${this.config.dp}.TR_064.States.wlanguest`,
            4: "",
            5: "",
        };
        const dp_name = {
            1: `${this.config.dp}.TR_064.States.wlan24name`,
            2: `${this.config.dp}.TR_064.States.wlan50name`,
            3: `${this.config.dp}.TR_064.States.wlanguestname`,
            4: "",
            5: "",
        };
        const dp_qr = {
            1: `${this.config.dp}.TR_064.States.wlan24QRCode`,
            2: `${this.config.dp}.TR_064.States.wlan50QRCode`,
            3: `${this.config.dp}.TR_064.States.wlanguestQRCode`,
            4: "",
            5: "",
        };
        let count = 4;
        if (this.wlanCount > 3) {
            count = this.wlanCount;
            dp["4"] = dp["3"];
            dp["3"] = `${this.config.dp}.TR_064.States.wlan60`;
            dp_name["4"] = dp_name["3"];
            dp_name["3"] = `${this.config.dp}.TR_064.States.wlan60name`;
            dp_qr["4"] = dp_qr["3"];
            dp_qr["3"] = `${this.config.dp}.TR_064.States.wlan60QRCode`;
            if (this.wlanCount > 4) {
                dp["5"] = dp["4"];
                dp["4"] = `${this.config.dp}.TR_064.States.wlan70`;
                dp_name["5"] = dp_name["4"];
                dp_name["4"] = `${this.config.dp}.TR_064.States.wlan70name`;
                dp_qr["5"] = dp_qr["4"];
                dp_qr["4"] = `${this.config.dp}.TR_064.States.wlan70QRCode`;
            }
        }
        this.adapter.log.debug(`Count WLAN ${count}`);
        for (let i = 1; i < count; i++) {
            let wpa = "";
            let pw = "";
            let ssid = "";
            const wlan_resp = await this.requests(`${wlan.link}${i}`, `${wlan.service}${i}`, `${wlan.action}`, "");
            this.adapter.log.debug(`WLAN: ${wlan_resp}`);
            if (wlan_resp != null && typeof wlan_resp === "string" && wlan_resp.indexOf("NewEnable") != -1) {
                const wlan_status = wlan_resp.match("<NewEnable>(.*?)</NewEnable>");
                if (wlan_status != null && wlan_status[1] != null) {
                    if (!this.checkvalue[dp[i]] || this.checkvalue[dp[i]] != wlan_status[1]) {
                        this.checkvalue[dp[i]] = wlan_status[1];
                        await this.adapter.setState(dp[i], { val: wlan_status[1] == "1" ? true : false, ack: true });
                    }
                }
                const wlan_g_name = wlan_resp.match("<NewSSID>(.*?)</NewSSID>");
                if (wlan_g_name != null && wlan_g_name[1] != null) {
                    if (!this.checkvalue[dp_name[i]] || this.checkvalue[dp_name[i]] != wlan_g_name[1]) {
                        this.checkvalue[dp_name[i]] = wlan_g_name[1];
                        ssid = wlan_g_name[1];
                        await this.adapter.setState(dp_name[i], { val: wlan_g_name[1], ack: true });
                    }
                }
                const wlan_secure = await this.requests(
                    `${wlan.link}${i}`,
                    `${wlan.service}${i}`,
                    "GetSecurityKeys",
                    "",
                );
                if (
                    wlan_secure != null &&
                    typeof wlan_secure === "string" &&
                    wlan_secure.indexOf("NewKeyPassphrase") != -1
                ) {
                    const wlan_pw = wlan_secure.match("<NewKeyPassphrase>(.*?)</NewKeyPassphrase>");
                    if (wlan_pw != null && wlan_pw[1] != null) {
                        pw = wlan_pw[1];
                    }
                }
                if (wlan_resp != null && typeof wlan_resp === "string" && wlan_resp.indexOf("NewBeaconType") != -1) {
                    const wlan_wpa = wlan_resp.match("<NewBeaconType>(.*?)</NewBeaconType>");
                    if (wlan_wpa != null && wlan_wpa[1] != null) {
                        wpa = wlan_wpa[1];
                    }
                }
                if (wpa != "" && pw != "" && ssid != "") {
                    const svg_string = await QRCode.toString(`WIFI:S:${ssid};T:${wpaKeys[wpa]};P:${pw};H:false;`, {
                        type: "svg",
                        width: 100,
                    });
                    await this.adapter.setState(dp_qr[i], { val: svg_string, ack: true });
                }
            }
        }
    }

    async loadRights() {
        let data = await this.requests(
            "/upnp/control/lanconfigsecurity",
            "urn:dslforum-org:service:LANConfigSecurity:1",
            "X_AVM-DE_GetCurrentUser",
            "",
        );
        this.adapter.log.debug(`X_AVM-DE_GetCurrentUser: ${data}`);
        if (data != null && typeof data === "string" && data.indexOf("X_AVM-DE_GetCurrentUser") != -1) {
            data = entities.decodeHTML(data);
            await this.parser
                .parseStringPromise(data)
                .then(async result => {
                    this.adapter.log.debug(`RESULTSecurity: ${JSON.stringify(result)}`);
                    if (result["s:envelope"]["s:body"]["u:x_avm-de_getcurrentuserresponse"]) {
                        const user = result["s:envelope"]["s:body"]["u:x_avm-de_getcurrentuserresponse"];
                        this.rights.user = user["newx_avm-de_currentusername"];
                        const right = user["newx_avm-de_currentuserrights"];
                        if (right && right.rights && right.rights.path) {
                            for (let i = 0; i < right.rights.path.length; i++) {
                                switch (right.rights.path[i]) {
                                    case "BoxAdmin":
                                        this.rights.boxAdmin = right.rights.access[i] == "readwrite" ? "C" : "X"; // C
                                        break;
                                    case "Phone":
                                        this.rights.phone = right.rights.access[i] == "readwrite" ? "P" : "X"; // P
                                        break;
                                    case "Dial":
                                        this.rights.dial = right.rights.access[i] == "readwrite" ? "D" : "X"; // D
                                        break;
                                    case "NAS":
                                        this.rights.auto = right.rights.access[i] == "readwrite" ? "N" : "X"; // N
                                        break;
                                    case "HomeAuto":
                                        this.rights.homeAuto = right.rights.access[i] == "readwrite" ? "H" : "X"; // H
                                        break;
                                    case "App":
                                        this.rights.app = right.rights.access[i]; // A
                                        break;
                                    default:
                                        this.rights.unknow = "-";
                                }
                            }
                        }
                    }
                    return true;
                })
                .catch(err => {
                    this.adapter.log.warn(err);
                    return false;
                });
        }
        return this.rights;
    }

    async updateTR064() {
        let data = await this.requests(
            "/upnp/control/deviceinfo",
            "urn:dslforum-org:service:DeviceInfo:1",
            "GetInfo",
            "",
        );
        this.adapter.log.debug(`RESULTDEVICE: ${data}`);
        let state = "";
        let loginfo = "";
        if (data != null && typeof data === "string" && data.indexOf("GetInfoResponse") != -1) {
            loginfo = await this.parser
                .parseStringPromise(data)
                .then(async result => {
                    this.adapter.log.debug(`RESULTDEVICE: ${JSON.stringify(result)}`);
                    if (
                        result &&
                        result["s:envelope"] &&
                        result["s:envelope"]["s:body"] &&
                        result["s:envelope"]["s:body"]["u:getinforesponse"]
                    ) {
                        const val = result["s:envelope"]["s:body"]["u:getinforesponse"];
                        state = `${this.config.dp}.TR_064.States.hardware`;
                        if (val.newhardwareversion) {
                            if (!this.checkvalue[state] || this.checkvalue[state] != val.newhardwareversion) {
                                this.checkvalue[state] = val.newhardwareversion;
                                await this.adapter.setState(state, { val: val.newhardwareversion, ack: true });
                            }
                            state = `${this.config.dp}.TR_064.States.serialnumber`;
                            if (val.newserialnumber) {
                                if (!this.checkvalue[state] || this.checkvalue[state] != val.newserialnumber) {
                                    this.checkvalue[state] = val.newserialnumber;
                                    await this.adapter.setState(state, { val: val.newserialnumber, ack: true });
                                }
                            }
                            state = `${this.config.dp}.TR_064.States.firmware`;
                            if (val.newsoftwareversion) {
                                if (!this.checkvalue[state] || this.checkvalue[state] != val.newsoftwareversion) {
                                    this.checkvalue[state] = val.newsoftwareversion;
                                    await this.adapter.setState(state, {
                                        val: val.newsoftwareversion.toString(),
                                        ack: true,
                                    });
                                }
                            }
                            state = `${this.config.dp}.TR_064.States.uptime`;
                            if (val.newuptime) {
                                if (!this.checkvalue[state] || this.checkvalue[state] != val.newuptime) {
                                    this.checkvalue[state] = val.newuptime;
                                    await this.adapter.setState(state, { val: parseInt(val.newuptime), ack: true });
                                }
                            }
                        }
                        return val.newdevicelog;
                    }
                    return "";
                })
                .catch(err => {
                    this.adapter.log.warn(err);
                    return err;
                });
        }
        const logs = await this.requestClient({
            method: "POST",
            url: "/data.lua",
            data: { page: "log", sid: this.config.response_sid.SessionInfo.SID },
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
        let datalog = "";
        if (logs && logs.data && logs.data.log && Array.isArray(logs.data.log)) {
            for (const line of logs.data.log) {
                if (line && line.msg) {
                    line.msg = Buffer.from(line.msg, "utf-8").toString();
                }
            }
            state = `${this.config.dp}.TR_064.States.protocol`;
            datalog = JSON.stringify(logs.data.log);
            if (!this.checkvalue[state] || this.checkvalue[state] != datalog) {
                this.checkvalue[state] = datalog;
                await this.adapter.setState(state, { val: datalog, ack: true });
            }
        } else if (loginfo) {
            const protocol = loginfo.split("\n");
            const protocol_array = [];
            if (protocol.length > 0) {
                let count = 0;
                for (const line of protocol) {
                    const valText = {};
                    valText[count] = Buffer.from(line, "utf-8").toString();
                    ++count;
                    protocol_array.push(valText);
                }
                state = `${this.config.dp}.TR_064.States.protocol`;
                datalog = JSON.stringify(protocol_array);
                if (!this.checkvalue[state] || this.checkvalue[state] != datalog) {
                    this.checkvalue[state] = datalog;
                    await this.adapter.setState(state, { val: datalog, ack: true });
                }
            }
        }
        data = await this.requests(
            "/upnp/control/deviceinfo",
            "urn:dslforum-org:service:DeviceInfo:1",
            "GetSecurityPort",
            "",
        );
        this.adapter.log.debug(`GetSecurityPort: ${data}`);
        const port = JSON.stringify(data).search("NewSecurityPort");
        if (port) {
            const sslport = data.toString().match("<NewSecurityPort>(.*?)</NewSecurityPort>");
            this.sslport = sslport != null && sslport[1] != null ? parseInt(sslport[1]) : 0;
            await this.adapter.setState(`${this.config.dp}.TR_064.States.sslport`, { val: this.sslport, ack: true });
        }
        data = await this.requests(
            "/upnp/control/wanpppconn1",
            "urn:dslforum-org:service:WANPPPConnection:1",
            "GetInfo",
            "",
        );
        this.adapter.log.debug(`RESULTINFO: ${data}`);
        if (data != null && typeof data === "string" && data.indexOf("GetInfoResponse") != -1) {
            await this.parser
                .parseStringPromise(data)
                .then(async result => {
                    this.adapter.log.debug(`RESULTINFO: ${JSON.stringify(result)}`);
                    if (
                        result &&
                        result["s:envelope"] &&
                        result["s:envelope"]["s:body"] &&
                        result["s:envelope"]["s:body"]["u:getinforesponse"]
                    ) {
                        const val = result["s:envelope"]["s:body"]["u:getinforesponse"];
                        this.adapter.log.debug(`RESULTINFO: ${JSON.stringify(val)}`);
                        state = `${this.config.dp}.TR_064.States.externalIPv4`;
                        if (val.newexternalipaddress) {
                            if (!this.checkvalue[state] || this.checkvalue[state] != val.newexternalipaddress) {
                                this.checkvalue[state] = val.newexternalipaddress;
                                await this.adapter.setState(`${this.config.dp}.TR_064.States.externalIPv4`, {
                                    val: val.newexternalipaddress.toString(),
                                    ack: true,
                                });
                            }
                        }
                        state = `${this.config.dp}.TR_064.States.mac`;
                        if (val.newmacaddress) {
                            if (!this.checkvalue[state] || this.checkvalue[state] != val.newmacaddress) {
                                this.checkvalue[state] = val.newmacaddress;
                                await this.adapter.setState(state, { val: val.newmacaddress, ack: true });
                            }
                        }
                        state = `${this.config.dp}.TR_064.States.upstream`;
                        if (val.newupstreammaxbitrate) {
                            if (!this.checkvalue[state] || this.checkvalue[state] != val.newupstreammaxbitrate) {
                                this.checkvalue[state] = val.newupstreammaxbitrate;
                                await this.adapter.setState(state, {
                                    val: parseInt(val.newupstreammaxbitrate),
                                    ack: true,
                                });
                            }
                        }
                        state = `${this.config.dp}.TR_064.States.downstream`;
                        if (val.newdownstreammaxbitrate) {
                            if (!this.checkvalue[state] || this.checkvalue[state] != val.newdownstreammaxbitrate) {
                                this.checkvalue[state] = val.newdownstreammaxbitrate;
                                await this.adapter.setState(state, {
                                    val: parseInt(val.newdownstreammaxbitrate),
                                    ack: true,
                                });
                            }
                        }
                        state = `${this.config.dp}.TR_064.States.status`;
                        if (val.newconnectionstatus) {
                            if (!this.checkvalue[state] || this.checkvalue[state] != val.newconnectionstatus) {
                                this.checkvalue[state] = val.newconnectionstatus;
                                await this.adapter.setState(state, { val: val.newconnectionstatus, ack: true });
                            }
                        }
                        state = `${this.config.dp}.TR_064.States.error`;
                        if (val.newlastconnectionerror) {
                            if (!this.checkvalue[state] || this.checkvalue[state] != val.newlastconnectionerror) {
                                this.checkvalue[state] = val.newlastconnectionerror;
                                await this.adapter.setState(state, { val: val.newlastconnectionerror, ack: true });
                            }
                        }
                    }
                    return true;
                })
                .catch(err => {
                    this.adapter.log.warn(err);
                    return false;
                });
        }
        data = await this.requests(
            "/igdupnp/control/WANIPConn1",
            "urn:schemas-upnp-org:service:WANIPConnection:1",
            "X_AVM_DE_GetExternalIPv6Address",
            "",
        );
        this.adapter.log.debug(`RESULTINFOIPv6: ${data}`);
        if (data != null && typeof data === "string" && data.indexOf("X_AVM_DE_GetExternalIPv6AddressResponse") != -1) {
            await this.parser
                .parseStringPromise(data)
                .then(async result => {
                    this.adapter.log.debug(`RESULTINFO: ${JSON.stringify(result)}`);
                    if (
                        result &&
                        result["s:envelope"] &&
                        result["s:envelope"]["s:body"] &&
                        result["s:envelope"]["s:body"]["u:x_avm_de_getexternalipv6addressresponse"]
                    ) {
                        const val = result["s:envelope"]["s:body"]["u:x_avm_de_getexternalipv6addressresponse"];
                        this.adapter.log.debug(`RESULTINFOIPv6: ${JSON.stringify(val)}`);
                        state = `${this.config.dp}.TR_064.States.externalIPv6`;
                        if (val.newexternalipv6address) {
                            if (!this.checkvalue[state] || this.checkvalue[state] != val.newexternalipv6address) {
                                this.checkvalue[state] = val.newexternalipv6address;
                                const ips = `${val.newexternalipv6address}/${val.newprefixlength}`;
                                await this.adapter.setState(state, { val: ips, ack: true });
                            }
                        }
                    }
                    return true;
                })
                .catch(err => {
                    this.adapter.log.warn(err);
                    return false;
                });
        }
        data = await this.requests(
            "/igdupnp/control/WANIPConn1",
            "urn:schemas-upnp-org:service:WANIPConnection:1",
            "X_AVM_DE_GetIPv6Prefix",
            "",
        );
        this.adapter.log.debug(`RESULTINFOIPv6Pre: ${data}`);
        if (data != null && typeof data === "string" && data.indexOf("X_AVM_DE_GetIPv6PrefixResponse") != -1) {
            await this.parser
                .parseStringPromise(data)
                .then(async result => {
                    this.adapter.log.debug(`RESULTINFO: ${JSON.stringify(result)}`);
                    if (
                        result &&
                        result["s:envelope"] &&
                        result["s:envelope"]["s:body"] &&
                        result["s:envelope"]["s:body"]["u:x_avm_de_getipv6prefixresponse"]
                    ) {
                        const val = result["s:envelope"]["s:body"]["u:x_avm_de_getipv6prefixresponse"];
                        this.adapter.log.debug(`RESULTINFOIPv6Pre: ${JSON.stringify(val)}`);
                        state = `${this.config.dp}.TR_064.States.externalIPv6Prefix`;
                        if (val.newipv6prefix) {
                            if (!this.checkvalue[state] || this.checkvalue[state] != val.newipv6prefix) {
                                this.checkvalue[state] = val.newipv6prefix;
                                const ips = `${val.newipv6prefix}/${val.newprefixlength}`;
                                await this.adapter.setState(state, { val: ips, ack: true });
                            }
                        }
                    }
                    return true;
                })
                .catch(err => {
                    this.adapter.log.warn(err);
                    return false;
                });
        }
        const right = `${this.config.dp}.TR_064.States.rights`;
        const rig = JSON.stringify(this.rights);
        if (!this.checkvalue[right] || this.checkvalue[right] != rig) {
            this.checkvalue[right] = rig;
            await this.adapter.setState(right, { val: rig, ack: true });
        }
        await this.adapter.setState(`${this.config.dp}.TR_064.States.lastupdate`, { val: Date.now(), ack: true });
    }

    destroy() {
        this.updateInterval && this.adapter.clearInterval(this.updateInterval);
    }

    /**
     * @param {string} fritz
     * @param {string} state
     * @param {object | null | undefined} obj
     * @param {number | null | undefined} qrcode
     */
    async sendCommand(fritz, state, obj, qrcode) {
        let resp = {};
        let val;
        let values = "";
        if (!state) {
            resp = { error: "Missing state!" };
        }
        try {
            if (typeof state !== "object") {
                val = JSON.parse(state);
            } else {
                val = state;
            }
            if (!val) {
                resp = { error: "Cannot parse state!" };
            }
        } catch (e) {
            resp = { error: JSON.stringify(e) };
        }
        if (Object.keys(resp).length === 0) {
            const device = this.services.find(dev => dev.servicetype === val.service);
            if (!val.service) {
                resp = { error: "Missing servcie!" };
            } else if (!val.action) {
                resp = { error: "Missing action!" };
            } else if (!device) {
                resp = { error: "Missing URL!" };
            } else {
                if (val.params && Object.keys(val.params).length > 0) {
                    for (const param in val.params) {
                        values += `<${param}>${val.params[param]}</${param}>`;
                    }
                }
                let response = await this.requests(device.eventsuburl, val.service, val.action, values);
                if (val.tag != null && val.tag != "") {
                    const path = response.toString().match(`<${val.tag}>(.*?)</${val.tag}>`);
                    if (path != null && path[1] != null && !path[1].toUpperCase().startsWith("HTTP")) {
                        path[1] = `${this.config.protocol}://${this.config.ip}:49000${path[1]}`;
                    }
                    if (path != null && path[1] != null) {
                        response = await this.requests(path[1], null, null, null);
                    }
                } else if (val.link != null && val.link != "") {
                    response = await this.requests(val.link, null, null, null);
                }
                // Mesh-Topologie is a JSON String
                if (typeof response === "string" && response.indexOf("<?xml") != -1) {
                    response = response
                        .replace(/<s:/g, "<")
                        .replace(/<u:/g, "<")
                        .replace(/<\/s:/g, "</")
                        .replace(/<\/u:/g, "</");
                    resp = await this.parser
                        .parseStringPromise(response)
                        .then(result => {
                            return result;
                        })
                        .catch(err => {
                            return { error: err };
                        });
                    if (val.html) {
                        response = entities.decodeHTML(response.toString());
                    }
                } else {
                    resp = response;
                }
                if (qrcode != null && resp.error == null) {
                    this.setQRCode(qrcode);
                }
                await this.adapter.setState(`${this.config.dp}.TR_064.States.responseXML`, {
                    val: response.toString(),
                    ack: true,
                });
                if (obj != null) {
                    this.adapter.sendTo(obj.from, obj.command, JSON.stringify(resp), obj.callback);
                }
            }
        } else {
            if (obj != null) {
                this.adapter.sendTo(obj.from, obj.command, resp, obj.callback);
            }
        }
        await this.adapter.setState(`${this.config.dp}.TR_064.States.response`, {
            val: JSON.stringify(resp),
            ack: true,
        });
    }

    async requests(request, service, action, params) {
        if (service) {
            request = `curl -s --anyauth --user "${this.config.user}:${this.config.password}" \
            "http://${this.config.ip}:49000${request}" \
            -H 'Content-Type: text/xml; charset="utf-8"' \
            -H 'SoapAction:${service}#${action}' \
            -d '<?xml version="1.0" encoding="utf-8"?>
                <s:Envelope s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"
                    xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
                   <s:Body>
                  <u:${action} xmlns:u='${service}'>${params}
                </u:${action}>
                   </s:Body>
                </s:Envelope>'`;
        } else {
            request = `curl -s --anyauth --user "${this.config.user}:${this.config.password}" \
            "${request}" \
            -H 'Content-Type: text/xml; charset="utf-8"'`;
        }
        return await exec(request).then(
            out => {
                this.adapter.log.debug(`OUT: ${out.stdout} - ${out.stderr}`);
                try {
                    if (out.stdout) {
                        return out.stdout;
                    }
                    if (out.stdout.toString().indexOf("Unauthorized") !== -1) {
                        return "Unauthorized";
                    }
                    return out.stdout;
                } catch (e) {
                    this.adapter.log.debug(`catch exec: ${JSON.stringify(e)}`);
                    return false;
                }
            },
            err => {
                this.adapter.log.debug(`requests: ${JSON.stringify(err)}`);
                return false;
            },
        );
    }

    rigthsCheck(service, action) {
        const urn = {
            "urn:dslforum-org:service:DeviceInfo:1": {
                GetDeviceLog: ["C"],
                GetInfov: ["C"],
                GetSecurityPort: ["-"],
                SetProvisioningCode: ["C"],
            },
            "urn:dslforum-org:service:DeviceConfig:1": {
                ConfigurationFinished: ["C"],
                ConfigurationStarted: ["C"],
                FactoryReset: ["C"],
                GetPersistentData: ["C"],
                Reboot: ["C"],
                SetPersistentData: ["C"],
                "X_AVM-DE_CreateUrlSID": ["C", "A", "P", "N", "H"],
                "X_AVM-DE_GetConfigFile": ["C"],
                "X_AVM-DE_SetConfigFile": ["C"],
                X_GenerateUUID: ["C"],
                "X_AVM-DE_GetSupportDataInfo": ["C", "A", "P", "N", "H"],
                "X_AVM-DE_SendSupportData": ["C", "A", "P", "N", "H"],
                "X_AVM-DE_GetSupportDataEnable": ["-"],
                "X_AVM-DE_SetSupportDataEnable": ["C"],
            },
            "urn:dslforum-org:service:Layer3Forwarding:1": {
                AddForwardingEntry: ["C"],
                DeleteForwardingEntry: ["C"],
                GetDefaultConnectionService: ["C"],
                GetForwardNumberOfEntries: ["C"],
                GetGenericForwardingEntry: ["C"],
                GetSpecificForwardingEntry: ["C"],
                SetDefaultConnectionService: ["C"],
                SetForwardingEntryEnabled: ["C"],
            },
            "urn:dslforum-org:service:LANConfigSecurity:1": {
                GetInfo: ["-"],
                SetConfigPassword: ["C", "A", "P", "N", "H"],
                "X_AVM-DE_GetAnonymousLogin": ["-"],
                "X_AVM-DE_GetCurrentUser": ["C", "A", "P", "N", "H"],
                "X_AVM-DE_GetUserList": ["-"],
            },
            "urn:dslforum-org:service:ManagementServer:1": {
                GetInfo: ["C"],
                SetConnectionRequestAuthentication: ["C"],
                SetManagementServerPassword: ["C"],
                SetManagementServerURL: ["C"],
                SetManagementServerUsername: ["C"],
                SetPeriodicInform: ["C"],
                SetUpgradeManagement: ["C"],
                "X_AVM-DE_GetTR069FirmwareDownloadEnabled": ["C"],
                "X_AVM-DE_SetTR069FirmwareDownloadEnabled": ["C"],
                X_SetTR069Enable: ["C"],
            },
            "urn:dslforum-org:service:Time:1": {
                GetInfo: ["C", "A", "P", "N", "H"],
                SetNTPServers: ["C"],
            },
            "urn:dslforum-org:service:UserInterface:1": {
                GetInfo: ["-"],
                "X_AVM-DE_CheckUpdate": ["C"],
                "X_AVM-DE_DoUpdate": ["C", "-"],
                "X_AVM-DE_DoPrepareCGI": ["C"],
                "X_AVM-DE_DoManualUpdate": ["C"],
                "X_AVM-DE_GetInternationalConfig": ["C"],
                "X_AVM-DE_SetInternationalConfig": ["C"],
                "X_AVM-DE_GetInfo": ["-"],
                "X_AVM-DE_SetConfig": ["C"],
            },
            "urn:dslforum-org:service:LANHostConfigManagement:1": {
                GetAddressRange: ["C"],
                GetDNSServers: ["C"],
                GetInfo: ["C"],
                GetIPInterfaceNumberOfEntries: ["C"],
                GetIPRoutersList: ["C"],
                GetSubnetMask: ["C"],
                SetAddressRange: ["C"],
                SetDHCPServerEnable: ["C"],
                SetIPInterface: ["C"],
                SetIPRouter: ["C"],
                SetSubnetMask: ["C"],
            },
            "urn:dslforum-org:service:LANEthernetInterfaceConfig:1": {
                GetInfo: ["C"],
                GetStatistics: ["C"],
                SetEnable: ["C"],
            },
            "urn:dslforum-org:service:Hosts:1": {
                GetGenericHostEntry: ["-"],
                GetHostNumberOfEntries: ["-"],
                GetSpecificHostEntry: ["-"],
                "X_AVM-DE_GetAutoWakeOnLANByMACAddress": ["-"],
                "X_AVM-DE_GetChangeCounter": ["-"],
                "X_AVM-DE_GetFriendlyName": ["-"],
                "X_AVM-DE_GetHostListPath": ["C", "A", "P"],
                "X_AVM-DE_GetInfo": ["-"],
                "X_AVM-DE_GetMeshListPath": ["C", "A", "P"],
                "X_AVM-DE_GetSpecificHostEntyByIP": ["C", "A", "P"],
                "X_AVM-DE_HostDoUpdate": ["C", "A"],
                "X_AVM-DE_HostsCheckUpdate": ["C", "A"],
                "X_AVM-DE_SetAutoWakeOnLANByMACAddress": ["-"],
                "X_AVM-DE_SetFriendlyName": ["C", "A", "P", "N", "H"],
                "X_AVM-DE_SetFriendlyNameByIP": ["C", "A"],
                "X_AVM-DE_SetFriendlyNameByMAC": ["C", "A"],
                "X_AVM-DE_SetHostNameByMACAddress": ["C"],
                "X_AVM-DE_SetPrioritizationByIP": ["C", "A", "P"],
                "X_AVM-DE_WakeOnLANByMACAddress": ["-"],
            },
            "urn:dslforum-org:service:WANCommonInterfaceConfig:1": {
                GetCommonLinkProperties: ["C", "A", "P", "N", "H"],
                GetTotalBytesReceived: ["C"],
                GetTotalBytesSent: ["C"],
                GetTotalPacketsReceived: ["C"],
                GetTotalPacketsSent: ["C"],
                "X_AVM-DE_GetActiveProvider": ["C", "A", "P"],
                "X_AVM-DE_SetWANAccessType": ["C"],
                "X_AVM-DE_GetOnlineMonitor": ["C"],
            },
            "urn:schemas-upnp-org:service:WANCommonInterfaceConfig:1": {
                GetCommonLinkProperties: ["C", "A", "P", "N", "H"],
                GetTotalBytesReceived: ["C"],
                GetTotalBytesSent: ["C"],
                GetTotalPacketsReceived: ["C"],
                GetTotalPacketsSent: ["C"],
                GetAddonInfos: ["C"],
                X_AVM_DE_GetDsliteStatus: ["C"],
                X_AVM_DE_GetIPTVInfos: ["C"],
                X_AVM_DE_WANAccessType: ["C"],
                X_AVM_DE_IPTV_URL: ["C"],
                X_AVM_DE_IPTV_Provider: ["C"],
                X_AVM_DE_IPTV_Enabled: ["C"],
                X_AVM_DE_TotalBytesSent64: ["C"],
                X_AVM_DE_TotalBytesReceived64: ["C"],
                X_AVM_DE_DsliteStatus: ["C"],
            },
            "urn:dslforum-org:service:WANDSLInterfaceConfig:1": {
                GetInfo: ["C"],
                GetStatisticsTotal: ["C"],
                "X_AVM-DE_GetDSLDiagnoseInfo": ["-"],
                "X_AVM-DE_GetDSLInfo": ["-"],
            },
            "urn:dslforum-org:service:WANDSLLinkConfig:1": {
                GetATMEncapsulation: ["C"],
                GetAutoConfig: ["C"],
                GetDestinationAddress: ["C"],
                GetDSLLinkInfo: ["C"],
                GetInfo: ["C"],
                GetStatistics: ["C"],
                SetATMEncapsulation: ["C"],
                SetDestinationAddress: ["C"],
                SetDSLLinkType: ["C"],
                SetEnable: ["C"],
            },
            "urn:schemas-upnp-org:service:WANDSLLinkConfig:1": {
                GetATMEncapsulation: ["C"],
                GetAutoConfig: ["C"],
                GetDestinationAddress: ["C"],
                GetDSLLinkInfo: ["C"],
                GetInfo: ["C"],
                GetStatistics: ["C"],
                SetATMEncapsulation: ["C"],
                SetDestinationAddress: ["C"],
                SetDSLLinkType: ["C"],
                SetEnable: ["C"],
                GetFCSPreserved: ["C"],
                SetFCSPreserved: ["C"],
            },
            "urn:dslforum-org:service:WANEthernetLinkConfig:1": {
                GetEthernetLinkStatus: ["C"],
            },
            "urn:dslforum-org:service:WANPPPConnection:1": {
                AddPortMapping: ["C"],
                DeletePortMapping: ["C"],
                ForceTermination: ["C"],
                GetConnectionType: ["C"],
                GetConnectionTypeInfo: ["C"],
                GetExternalIPAddress: ["C"],
                GetGenericPortMappingEntry: ["C"],
                GetInfo: ["C"],
                GetLinkLayerMaxBitRates: ["C"],
                GetNATRSIPStatus: ["C"],
                GetPortMappingNumberOfEntries: ["C"],
                GetSpecificPortMappingEntry: ["C"],
                GetStatusInfo: ["C"],
                GetUserName: ["C"],
                RequestConnection: ["C"],
                SetConnectionTrigger: ["C"],
                SetIdleDisconnectTime: ["C"],
                SetPassword: ["C"],
                SetRouteProtocolRx: ["C"],
                SetUserName: ["C"],
                "X_AVM-DE_GetAutoDisconnectTimeSpan": ["C"],
                "X_AVM-DE_SetAutoDisconnectTimeSpan": ["C"],
                X_GetDNSServers: ["C"],
            },
            "urn:dslforum-org:service:WANIPConnection:1": {
                AddPortMapping: ["C"],
                DeletePortMapping: ["C"],
                ForceTermination: ["C"],
                GetConnectionType: ["C"],
                GetConnectionTypeInfo: ["C"],
                GetExternalIPAddress: ["C"],
                GetGenericPortMappingEntry: ["C"],
                GetInfo: ["C"],
                GetNATRSIPStatus: ["C"],
                GetPortMappingNumberOfEntries: ["C"],
                GetSpecificPortMappingEntry: ["C"],
                GetStatusInfo: ["C"],
                RequestConnection: ["C"],
                SetConnectionTrigger: ["C"],
                SetIdleDisconnectTime: ["C"],
                SetRouteProtocolRx: ["C"],
                X_GetDNSServers: ["C"],
            },
            "urn:schemas-upnp-org:service:WANIPConnection:1": {
                SetConnectionType: ["C"],
                GetConnectionTypeInfo: ["C"],
                GetAutoDisconnectTime: ["C"],
                GetIdleDisconnectTime: ["C"],
                GetStatusInfo: ["C"],
                GetNATRSIPStatus: ["C"],
                GetGenericPortMappingEntry: ["C"],
                GetSpecificPortMappingEntry: ["C"],
                AddPortMapping: ["C"],
                DeletePortMapping: ["C"],
                GetExternalIPAddress: ["C"],
                X_AVM_DE_GetExternalIPv6Address: ["C"],
                X_AVM_DE_GetIPv6Prefix: ["C"],
                X_AVM_DE_GetDNSServer: ["C"],
                X_AVM_DE_GetIPv6DNSServer: ["C"],
            },
            "urn:dslforum-org:service:WLANConfiguration:1": {
                GetBasBeaconSecurityProperties: ["C"],
                GetBeaconAdvertisement: ["C"],
                GetBeaconType: ["C", "A"],
                GetBSSID: ["C"],
                GetChannelInfo: ["C"],
                GetGenericAssociatedDeviceInfo: ["C", "A", "P"],
                GetInfo: ["C", "A", "P"],
                GetPacketStatistics: ["C"],
                GetSecurityKeys: ["A"],
                GetSpecificAssociatedDeviceInfo: ["C", "A", "P"],
                GetSSID: ["A"],
                GetStatistics: ["C"],
                GetTotalAssociations: ["C", "A", "P"],
                SetBasBeaconSecurityProperties: ["C"],
                SetBeaconAdvertisement: ["C"],
                SetBeaconType: ["C"],
                SetChannel: ["C"],
                SetConfig: ["C"],
                SetEnable: ["C", "A"],
                SetSecurityKeys: ["C"], //C for normal AP, A for guest AP
                SetSSID: ["C"],
                "X_AVM-DE_GetIPTVOptimzed": ["C"],
                "X_AVM-DE_GetNightControl": ["-"],
                "X_AVM-DE_GetSpecificAssociatedDeviceInfoByIp": ["C", "A", "P"],
                "X_AVM-DE_GetWLANConnectionInfo": ["-"],
                "X_AVM-DE_GetWLANDeviceListPath": ["C", "A", "P"],
                "X_AVM-DE_GetWLANExtInfo": ["C", "A"],
                "X_AVM-DE_GetWLANHybridMode": ["C"],
                "X_AVM-DE_GetWPSInfo": ["C", "A"],
                "X_AVM-DE_SetIPTVOptimzed": ["C"],
                "X_AVM-DE_SetStickSurfEnable": ["C"],
                "X_AVM-DE_SetWLANGlobalEnable": ["C", "A"],
                "X_AVM-DE_SetWLANHybridMode": ["C"],
                "X_AVM-DE_SetWPSConfig": ["C", "A"],
                "X_AVM-DE_SetWPSEnable": ["C", "A"],
            },
            "urn:dslforum-org:service:WLANConfiguration:2": {
                GetBasBeaconSecurityProperties: ["C"],
                GetBeaconAdvertisement: ["C"],
                GetBeaconType: ["C", "A"],
                GetBSSID: ["C"],
                GetChannelInfo: ["C"],
                GetGenericAssociatedDeviceInfo: ["C", "A", "P"],
                GetInfo: ["C", "A", "P"],
                GetPacketStatistics: ["C"],
                GetSecurityKeys: ["A"],
                GetSpecificAssociatedDeviceInfo: ["C", "A", "P"],
                GetSSID: ["A"],
                GetStatistics: ["C"],
                GetTotalAssociations: ["C", "A", "P"],
                SetBasBeaconSecurityProperties: ["C"],
                SetBeaconAdvertisement: ["C"],
                SetBeaconType: ["C"],
                SetChannel: ["C"],
                SetConfig: ["C"],
                SetEnable: ["C", "A"],
                SetSecurityKeys: ["C"], //C for normal AP, A for guest AP
                SetSSID: ["C"],
                "X_AVM-DE_GetIPTVOptimzed": ["C"],
                "X_AVM-DE_GetNightControl": ["-"],
                "X_AVM-DE_GetSpecificAssociatedDeviceInfoByIp": ["C", "A", "P"],
                "X_AVM-DE_GetWLANConnectionInfo": ["-"],
                "X_AVM-DE_GetWLANDeviceListPath": ["C", "A", "P"],
                "X_AVM-DE_GetWLANExtInfo": ["C", "A"],
                "X_AVM-DE_GetWLANHybridMode": ["C"],
                "X_AVM-DE_GetWPSInfo": ["C", "A"],
                "X_AVM-DE_SetIPTVOptimzed": ["C"],
                "X_AVM-DE_SetStickSurfEnable": ["C"],
                "X_AVM-DE_SetWLANGlobalEnable": ["C", "A"],
                "X_AVM-DE_SetWLANHybridMode": ["C"],
                "X_AVM-DE_SetWPSConfig": ["C", "A"],
                "X_AVM-DE_SetWPSEnable": ["C", "A"],
            },
            "urn:dslforum-org:service:WLANConfiguration:3": {
                GetBasBeaconSecurityProperties: ["C"],
                GetBeaconAdvertisement: ["C"],
                GetBeaconType: ["C", "A"],
                GetBSSID: ["C"],
                GetChannelInfo: ["C"],
                GetGenericAssociatedDeviceInfo: ["C", "A", "P"],
                GetInfo: ["C", "A", "P"],
                GetPacketStatistics: ["C"],
                GetSecurityKeys: ["A"],
                GetSpecificAssociatedDeviceInfo: ["C", "A", "P"],
                GetSSID: ["A"],
                GetStatistics: ["C"],
                GetTotalAssociations: ["C", "A", "P"],
                SetBasBeaconSecurityProperties: ["C"],
                SetBeaconAdvertisement: ["C"],
                SetBeaconType: ["C"],
                SetChannel: ["C"],
                SetConfig: ["C"],
                SetEnable: ["C", "A"],
                SetSecurityKeys: ["C"], //C for normal AP, A for guest AP
                SetSSID: ["C"],
                "X_AVM-DE_GetIPTVOptimzed": ["C"],
                "X_AVM-DE_GetNightControl": ["-"],
                "X_AVM-DE_GetSpecificAssociatedDeviceInfoByIp": ["C", "A", "P"],
                "X_AVM-DE_GetWLANConnectionInfo": ["-"],
                "X_AVM-DE_GetWLANDeviceListPath": ["C", "A", "P"],
                "X_AVM-DE_GetWLANExtInfo": ["C", "A"],
                "X_AVM-DE_GetWLANHybridMode": ["C"],
                "X_AVM-DE_GetWPSInfo": ["C", "A"],
                "X_AVM-DE_SetIPTVOptimzed": ["C"],
                "X_AVM-DE_SetStickSurfEnable": ["C"],
                "X_AVM-DE_SetWLANGlobalEnable": ["C", "A"],
                "X_AVM-DE_SetWLANHybridMode": ["C"],
                "X_AVM-DE_SetWPSConfig": ["C", "A"],
                "X_AVM-DE_SetWPSEnable": ["C", "A"],
            },
            "urn:dslforum-org:service:X_VoIP:1": {
                GetExistingVoIPNumbers: ["P"],
                GetInfo: ["P"],
                GetInfoEx: ["P"],
                GetMaxVoIPNumbers: ["P"],
                GetVoIPCommonAreaCode: ["P"],
                GetVoIPCommonCountryCode: ["P"],
                GetVoIPEnableAreaCode: ["P"],
                GetVoIPEnableCountryCode: ["P"],
                SetConfig: ["P"],
                SetVoIPCommonAreaCode: ["P"],
                SetVoIPCommonCountryCode: ["P"],
                SetVoIPEnableAreaCode: ["P"],
                SetVoIPEnableCountryCode: ["P"],
                "X_AVM-DE_AddVoIPAccount": ["P"],
                "X_AVM-DE_DeleteClient": ["P"],
                "X_AVM-DE_DelVoIPAccount": ["P"],
                "X_AVM-DE_DialGetConfig": ["P"],
                "X_AVM-DE_DialHangup": ["P"],
                "X_AVM-DE_DialNumber": ["P"],
                "X_AVM-DE_DialSetConfig": ["P"],
                "X_AVM-DE_GetAlarmClock": ["P"],
                "X_AVM-DE_GetClient": ["P"],
                "X_AVM-DE_GetClient2": ["P"],
                "X_AVM-DE_GetClient3": ["P"],
                "X_AVM-DE_GetClientByClientId": ["A", "P"],
                "X_AVM-DE_GetClients": ["P"],
                "X_AVM-DE_GetNumberOfAlarmClocks": ["P"],
                "X_AVM-DE_GetNumberOfClients": ["P"],
                "X_AVM-DE_GetNumberOfNumbers": ["P"],
                "X_AVM-DE_GetNumbers": ["P"],
                "X_AVM-DE_GetPhonePort": ["P"],
                "X_AVM-DE_GetVoIPAccount": ["P"],
                "X_AVM-DE_GetVoIPAccounts": ["A", "P"],
                "X_AVM-DE_GetVoIPCommonAreaCode": ["P"],
                "X_AVM-DE_GetVoIPCommonCountryCode": ["P"],
                "X_AVM-DE_GetVoIPStatus": ["A", "P"],
                "X_AVM-DE_SetAlarmClockEnable": ["P"],
                "X_AVM-DE_SetClient": ["P"],
                "X_AVM-DE_SetClient2": ["P"],
                "X_AVM-DE_SetClient3": ["P"],
                "X_AVM-DE_SetClient4": ["P"],
                "X_AVM-DE_SetDelayedCallNotification": ["P"],
                "X_AVM-DE_SetVoIPCommonAreaCode": ["P"],
                "X_AVM-DE_SetVoIPCommonCountryCode": ["P"],
            },
            "urn:dslforum-org:service:X_AVM-DE_Storage:1": {
                GetInfo: ["C", "A"],
                GetUserInfo: ["C"],
                RequestFTPServerWAN: ["N", "A"],
                SetFTPServer: ["C"],
                SetFTPServerWAN: ["C"],
                SetSMBServer: ["C"],
                SetUserConfig: ["C"],
            },
            "urn:dslforum-org:service:X_AVM-DE_WebDAVClient:1": {
                GetInfo: ["C"],
                SetConfig: ["C"],
            },
            "urn:dslforum-org:service:X_AVM-DE_UPnP:1": {
                GetInfo: ["C"],
                SetConfig: ["C"],
            },
            "urn:dslforum-org:service:X_AVM-DE_OnTel:1": {
                AddPhonebook: ["P"],
                DeleteByIndex: ["P"],
                DeleteCallBarringEntryUID: ["P"],
                DeleteDeflection: ["P"],
                DeletePhonebook: ["P"],
                DeletePhonebookEntry: ["P"],
                DeletePhonebookEntryUID: ["P"],
                GetCallBarringEntry: ["P"],
                GetCallBarringEntryByNum: ["P"],
                GetCallBarringList: ["P"],
                GetCallList: ["P"],
                GetDECTHandsetInfo: ["P"],
                GetDECTHandsetList: ["P"],
                GetDeflection: ["P"],
                GetDeflections: ["P"],
                GetInfo: ["P"],
                GetInfoByIndex: ["P"],
                GetNumberOfDeflections: ["P"],
                GetNumberOfEntries: ["P"],
                GetPhonebook: ["P"],
                GetPhonebookEntry: ["P"],
                GetPhonebookEntryUID: ["P"],
                GetPhonebookList: ["P"],
                SetCallBarringEntry: ["P"],
                SetConfig: ["P"],
                SetConfigByIndex: ["P"],
                SetDECTHandsetPhonebook: ["P"],
                SetDeflection: ["P"],
                SetDeflectionEnable: ["P"],
                SetEnable: ["P"],
                SetEnableByIndex: ["P"],
                SetPhonebookEntry: ["P"],
                SetPhonebookEntryUID: ["P"],
            },
            "urn:dslforum-org:service:X_AVM-DE_TAM:1": {
                DeleteMessage: ["P"],
                GetInfo: ["P"],
                GetList: ["A", "P"],
                GetMessageList: ["P"],
                MarkMessage: ["P"],
                SetEnable: ["P"],
            },
            "urn:dslforum-org:service:X_AVM-DE_RemoteAccess:1": {
                GetDDNSInfo: ["C", "A", "P", "N", "H"],
                GetDDNSProviders: ["C"],
                GetInfo: ["C", "A", "P", "N", "H"],
                SetConfig: ["C"],
                SetDDNSConfig: ["C"],
                SetEnable: ["C"],
                SetLetsEncryptEnable: ["C", "A"],
            },
            "urn:dslforum-org:service:X_AVM-DE_MyFritz:1": {
                DeleteServiceByIndex: ["C", "A", "P"],
                GetInfo: ["C", "A", "P", "N", "H"],
                GetNumberOfServices: ["C", "A", "P"],
                GetServiceByIndex: ["C", "A", "P"],
                SetServiceByIndex: ["C", "A", "P"],
                SetMyFRITZ: ["C", "A"],
            },
            "urn:dslforum-org:service:X_AVM-DE_Speedtest:1": {
                GetInfo: ["C"],
                GetStatistics: ["C"],
                ResetStatistics: ["C"],
                SetConfig: ["C"],
            },
            "urn:dslforum-org:service:X_AVM-DE_AppSetup:1": {
                GetAppMessageFilter: ["C", "A", "P", "N", "H"],
                GetAppRemoteInfo: ["C", "A"],
                GetBoxSenderId: ["C", "A", "P", "N", "H"],
                GetConfig: ["C", "A", "P", "N", "H"],
                GetInfo: ["-"],
                RegisterApp: ["C", "P", "N", "H"],
                ResetEvent: ["C"],
                SetAppMessageFilter: ["C", "A", "P", "N", "H"],
                SetAppMessageReceiver: ["C", "A", "P", "N", "H"],
                SetAppVPN: ["C"],
                SetAppVPNwithPFS: ["C"],
            },
            "urn:dslforum-org:service:X_AVM-DE_Homeplug:1": {
                DeviceDoUpdate: ["C", "A"],
                GetGenericDeviceEntry: ["C", "A"],
                GetNumberOfDeviceEntries: ["C", "A"],
                GetSpecificDeviceEntry: ["C", "A"],
            },
            "urn:dslforum-org:service:X_AVM-DE_Homeauto:1": {
                GetGenericDeviceInfos: ["C", "H"],
                GetInfo: ["C", "H"],
                GetSpecificDeviceInfos: ["C", "H"],
                SetDeviceName: ["C", "A"],
                SetSwitch: ["C", "H"],
            },
            "urn:dslforum-org:service:X_AVM-DE_Dect:1": {
                DectDoUpdate: ["C", "A"],
                GetDectListPath: ["C", "A"],
                GetGenericDectEntry: ["C", "A", "P", "H"],
                GetNumberOfDectEntries: ["C", "A", "P", "H"],
                GetSpecificDectEntry: ["C", "A", "P", "H"],
            },
            "urn:dslforum-org:service:X_AVM-DE_Filelinks:1": {
                DeleteFilelinkEntry: ["C", "N"],
                GetFileLinkListPath: ["C", "N"],
                GetGenericFilelinkEntry: ["C", "N"],
                GetNumberOfFilelinkEntries: ["C", "N"],
                GetSpecificSpecificEntry: ["C", "N"],
                NewFilelinkEntry: ["C", "N"],
                SetFilelinkEntry: ["C", "N"],
            },
            "urn:dslforum-org:service:X_AVM-DE_USPController:1": {
                AddUSPContoller: ["C"],
                DeleteUSPControllerByIndex: ["C"],
                GetInfo: ["C", "A", "P", "N", "H"],
                GetUSPControllerByIndex: ["C"],
                GetUSPContollerNumberOfEntries: ["C"],
                GetUSPMyFRITZEnable: ["C", "A"],
                SetUSPControllerEnableByIndex: ["C"],
                SetUSPMyFRITZEnable: ["C", "A", "P", "N", "H"],
            },
            "urn:dslforum-org:service:X_AVM-DE_Auth:1": {
                GetInfo: ["C", "A", "P", "N", "H"],
                GetState: ["C", "A", "P", "N", "H"],
                SetConfig: ["C", "A", "P", "N", "H"],
            },
            "urn:dslforum-org:service:X_AVM-DE_HostFilter:1": {
                DisallowWANAccessByIP: ["C", "A"],
                MarkTicket: ["C", "A"],
                GetTicketIDStatus: ["C", "A"],
                DiscardAllTickets: ["C", "A"],
                GetWANAccessByIP: ["C", "A"],
            },
            "urn:dslforum-org:service:X_AVM-DE_Media:1": {
                GetDVBCEnable: ["-"],
                GetInfo: ["-"],
                GetSearchProgress: ["-"],
                SetDVBCEnable: ["C", "A"],
                StationSearch: ["C", "A"],
            },
            "urn:dslforum-org:service:X_AVM-DE_WANMobileConnection:1": {
                GetAccessTechnology: ["C", "A"],
                GetBandCapabilities: ["C", "A"],
                GetEnabledBandCapabilities: ["C", "A"],
                GetInfo: ["C", "A"],
                GetInfoEx: ["C", "A"],
                GetPreferredAccessTechnology: ["C", "A"],
                SetAccessTechnology: ["C", "A"],
                SetEnabledBandCapabilities: ["C", "A"],
                SetPIN: ["C", "A"],
                SetPreferredAccessTechnology: ["C", "A"],
                SetPUK: ["C", "A"],
            },
            "urn:dslforum-org:service:X_AVM-DE_WANFiber:1": {
                GetInfo: ["C", "A"],
                GetInfoGPON: ["C", "A"],
                GetStatistics: ["C", "A"],
            },
            "urn:schemas-upnp-org:service:WANIPv6FirewallControl:1": {
                GetFirewallStatus: ["C"],
                GetOutboundPinholeTimeout: ["C"],
                AddPinhole: ["C"],
                UpdatePinhole: ["C"],
                DeletePinhole: ["C"],
                GetPinholePackets: ["C"],
                CheckPinholeWorking: ["C"],
            },
            "urn:schemas-any-com:service:Any:1": {
                Dummy: ["C"],
            },
        };
        if (action) {
            if (urn[service]) {
                if (urn[service][action]) {
                    for (const right in this.rights) {
                        const found = urn[service][action].find(element => element == this.rights[right]);
                        if (found) {
                            return true;
                        }
                    }
                    return false;
                }
                this.adapter.log.warm(`No action found for ${action}`);
                return false;
            }
            this.adapter.log.warm(`No service found for ${service}`);
            return false;
        } else if (service) {
            if (urn[service]) {
                return urn[service];
            }
            return ["No Service found"];
        }
        return ["UNKNOWN"];
    }
}

module.exports = TR064;
