const EventEmitter = require("events");
const util = require("util");
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

/**
 *
 * @extends EventEmitter
 */
class TR064 extends EventEmitter {
    constructor(config, adapter) {
        super();
        this.adapter = adapter;
        this.config = config;
        this.updateInterval = null;
        this.services = [];
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
            .then(async (res) => {
                if (res.data) {
                    return res.data;
                } else {
                    return res;
                }
            })
            .catch((error) => {
                return error;
            });
        this.updateInterval && this.adapter.clearInterval(this.updateInterval);
        if (commandURL != null && typeof commandURL === "string" && commandURL.indexOf("serviceList") != -1) {
            commandURL = commandURL.toString().replace(/\n/g, "");
            await this.parser
                .parseStringPromise(commandURL)
                .then((result) => {
                    if (
                        result &&
                        result.root &&
                        result.root.device &&
                        result.root.device.servicelist &&
                        result.root.device.servicelist.service
                    ) {
                        this.services = this.services.concat(result.root.device.servicelist.service);
                    }
                    if (
                        result &&
                        result.root &&
                        result.root.device &&
                        result.root.device.devicelist &&
                        result.root.device.devicelist.device
                    ) {
                        for (const device of result.root.device.devicelist.device) {
                            if (device && device.servicelist && device.servicelist.service) {
                                this.services = this.services.concat(device.servicelist.service);
                            }
                            if (
                                device &&
                                device.devicelist &&
                                device.devicelist.device.servicelist &&
                                device.devicelist.device.servicelist.service
                            ) {
                                this.services = this.services.concat(device.devicelist.device.servicelist.service);
                            }
                        }
                    }
                    if (this.services.length > 0) {
                        this.adapter.setState(
                            `${this.config.dp}.TR_064.States.sendCommandPossible`,
                            JSON.stringify(this.services),
                            true,
                        );
                    }
                    return true;
                })
                .catch((err) => {
                    this.adapter.log.warn(err);
                    return false;
                });
            commandURL = "";
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
        this.adapter.log.info("SID: " + this.config.response_sid.SessionInfo.SID);
        const ecoStat = await this.requestClient({
            method: "POST",
            url: "/data.lua",
            data: { page: "ecoStat", sid: this.config.response_sid.SessionInfo.SID },
        })
            .then(async (res) => {
                if (res.data) {
                    return res.data;
                } else {
                    return res;
                }
            })
            .catch((error) => {
                return error;
            });
        if (ecoStat && ecoStat.data) {
            if (ecoStat.data.cputemp && ecoStat.data.cpuutil.series) {
                await this.adapter.setStateAsync(
                    `${this.config.dp}.TR_064.States.Energy.cpu_usage`,
                    JSON.stringify(ecoStat.data.cpuutil.series),
                    true,
                );
                await this.adapter.setStateAsync(
                    `${this.config.dp}.TR_064.States.Energy.cpu_usage_scale`,
                    JSON.stringify(ecoStat.data.cputemp.labels),
                    true,
                );
            }
            if (ecoStat.data.cputemp && ecoStat.data.cputemp.series) {
                await this.adapter.setStateAsync(
                    `${this.config.dp}.TR_064.States.Energy.cpu_temperature`,
                    JSON.stringify(ecoStat.data.cputemp.series),
                    true,
                );
            }
            if (ecoStat.data.cputemp && ecoStat.data.ramusage.series) {
                await this.adapter.setStateAsync(
                    `${this.config.dp}.TR_064.States.Energy.ram_usage`,
                    JSON.stringify(ecoStat.data.ramusage.series),
                    true,
                );
                await this.adapter.setStateAsync(
                    `${this.config.dp}.TR_064.States.Energy.ram_usage_scale`,
                    JSON.stringify(ecoStat.data.ramusage.labels),
                    true,
                );
            }
        } else {
            this.adapter.log.warn(`Error EcoState: ${ecoStat}`);
        }
        const energy = await this.requestClient({
            method: "POST",
            url: "/data.lua",
            data: { page: "energy", sid: this.config.response_sid.SessionInfo.SID },
        })
            .then(async (res) => {
                if (res.data) {
                    return res.data;
                } else {
                    return res;
                }
            })
            .catch((error) => {
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
                    await this.adapter.setStateAsync(
                        `${this.config.dp}.TR_064.States.Energy.${dp[count]}`,
                        parseInt(val.cumPerc),
                        true,
                    );
                    ++count;
                    await this.adapter.setStateAsync(
                        `${this.config.dp}.TR_064.States.Energy.${dp[count]}`,
                        parseInt(val.actPerc),
                        true,
                    );
                    ++count;
                }
                if (val && val.lan && Array.isArray(val.lan)) {
                    for (const fon of val.lan) {
                        const name = fon.name != null ? fon.name.toLowerCase().replace(/ /g, "") : "";
                        if (name != "") {
                            await this.adapter.setStateAsync(
                                `${this.config.dp}.TR_064.States.Energy.${name}`,
                                fon.class != "" ? true : false,
                                true,
                            );
                        }
                    }
                }
            }
        } else {
            this.adapter.log.warn(`Error energy: ${ecoStat}`);
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
            .then(async (result) => {
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
                            await this.adapter.setStateAsync(state, val.newsyncgroupmode, true);
                        }
                    }
                    state = `${this.config.dp}.TR_064.States.Traffic.newds_current_bps`;
                    if (val.newds_current_bps) {
                        if (!this.checkvalue[state] || this.checkvalue[state] != val.newds_current_bps) {
                            this.checkvalue[state] = val.newds_current_bps;
                            await this.adapter.setStateAsync(
                                state,
                                JSON.stringify(val.newds_current_bps.split(",")),
                                true,
                            );
                        }
                    }
                    state = `${this.config.dp}.TR_064.States.Traffic.newmc_current_bps`;
                    if (val.newmc_current_bps) {
                        if (!this.checkvalue[state] || this.checkvalue[state] != val.newmc_current_bps) {
                            this.checkvalue[state] = val.newmc_current_bps;
                            await this.adapter.setStateAsync(
                                state,
                                JSON.stringify(val.newmc_current_bps.split(",")),
                                true,
                            );
                        }
                    }
                    state = `${this.config.dp}.TR_064.States.Traffic.newus_current_bps`;
                    if (val.newus_current_bps) {
                        if (!this.checkvalue[state] || this.checkvalue[state] != val.newus_current_bps) {
                            this.checkvalue[state] = val.newus_current_bps;
                            await this.adapter.setStateAsync(
                                state,
                                JSON.stringify(val.newus_current_bps.split(",")),
                                true,
                            );
                        }
                    }
                    state = `${this.config.dp}.TR_064.States.Traffic.newprio_realtime_bps`;
                    if (val.newprio_realtime_bps) {
                        if (!this.checkvalue[state] || this.checkvalue[state] != val.newprio_realtime_bps) {
                            this.checkvalue[state] = val.newprio_realtime_bps;
                            await this.adapter.setStateAsync(
                                state,
                                JSON.stringify(val.newprio_realtime_bps.split(",")),
                                true,
                            );
                        }
                    }
                    state = `${this.config.dp}.TR_064.States.Traffic.newprio_high_bps`;
                    if (val.newprio_high_bps) {
                        if (!this.checkvalue[state] || this.checkvalue[state] != val.newprio_high_bps) {
                            this.checkvalue[state] = val.newprio_high_bps;
                            await this.adapter.setStateAsync(
                                state,
                                JSON.stringify(val.newprio_high_bps.split(",")),
                                true,
                            );
                        }
                    }
                    state = `${this.config.dp}.TR_064.States.Traffic.newprio_default_bps`;
                    if (val.newprio_default_bps) {
                        if (!this.checkvalue[state] || this.checkvalue[state] != val.newprio_default_bps) {
                            this.checkvalue[state] = val.newprio_default_bps;
                            await this.adapter.setStateAsync(
                                state,
                                JSON.stringify(val.newprio_default_bps.split(",")),
                                true,
                            );
                        }
                    }
                    state = `${this.config.dp}.TR_064.States.Traffic.newprio_low_bps`;
                    if (val.newprio_low_bps) {
                        if (!this.checkvalue[state] || this.checkvalue[state] != val.newprio_low_bps) {
                            this.checkvalue[state] = val.newprio_low_bps;
                            await this.adapter.setStateAsync(
                                state,
                                JSON.stringify(val.newprio_low_bps.split(",")),
                                true,
                            );
                        }
                    }
                }
                return true;
            })
            .catch((err) => {
                this.adapter.log.warn(err);
                return false;
            });
        const options_axios = (action) => {
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
            .then(async (result) => {
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
                            await this.adapter.setStateAsync(state, val.newwanaccesstype, true);
                        }
                    }
                    state = `${this.config.dp}.TR_064.States.Traffic.upload`;
                    if (val.newlayer1upstreammaxbitrate) {
                        if (!this.checkvalue[state] || this.checkvalue[state] != val.newlayer1upstreammaxbitrate) {
                            this.checkvalue[state] = val.newlayer1upstreammaxbitrate;
                            const mu = (val.newlayer1upstreammaxbitrate / 1024 / 1024).toFixed(2);
                            await this.adapter.setStateAsync(state, parseFloat(mu), true);
                        }
                    }
                    state = `${this.config.dp}.TR_064.States.Traffic.download`;
                    if (val.newlayer1downstreammaxbitrate) {
                        if (!this.checkvalue[state] || this.checkvalue[state] != val.newlayer1downstreammaxbitrate) {
                            this.checkvalue[state] = val.newlayer1downstreammaxbitrate;
                            const md = (val.newlayer1downstreammaxbitrate / 1024 / 1024).toFixed(2);
                            await this.adapter.setStateAsync(state, parseFloat(md), true);
                        }
                    }
                }
                return true;
            })
            .catch((err) => {
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
                    await this.adapter.setStateAsync(link, parseFloat(value), true);
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
                    await this.adapter.setStateAsync(link, parseFloat(value), true);
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
                    await this.adapter.setStateAsync(link, parseFloat(value), true);
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
                    await this.adapter.setStateAsync(link, parseFloat(value), true);
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
            4: `${this.config.dp}.TR_064.States.wlanguestname`,
        };
        for (let i = 1; i < 4; i++) {
            const wlan_resp = await this.requests(`${wlan.link}${i}`, `${wlan.service}${i}`, `${wlan.action}`, "");
            this.adapter.log.debug("WLAN: " + wlan_resp);
            if (wlan_resp != null && typeof wlan_resp === "string" && wlan_resp.indexOf("NewEnable") != -1) {
                const wlan_status = wlan_resp.match("<NewEnable>(.*?)</NewEnable>");
                if (wlan_status != null && wlan_status[1] != null) {
                    if (!this.checkvalue[dp[i]] || this.checkvalue[dp[i]] != wlan_status[1]) {
                        this.checkvalue[dp[i]] = wlan_status[1];
                        await this.adapter.setStateAsync(dp[i], wlan_status[1] == "1" ? true : false, true);
                    }
                }
                if (i === 3) {
                    const wlan_g_name = wlan_resp.match("<NewSSID>(.*?)</NewSSID>");
                    if (wlan_g_name != null && wlan_g_name[1] != null) {
                        if (!this.checkvalue[dp["4"]] || this.checkvalue[dp["4"]] != wlan_g_name[1]) {
                            this.checkvalue[dp["4"]] = wlan_g_name[1];
                            await this.adapter.setStateAsync(dp["4"], wlan_g_name[1], true);
                        }
                    }
                }
            }
        }
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
        if (data != null && typeof data === "string" && data.indexOf("GetInfoResponse") != -1) {
            await this.parser
                .parseStringPromise(data)
                .then(async (result) => {
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
                                await this.adapter.setStateAsync(state, val.newhardwareversion, true);
                            }
                            state = `${this.config.dp}.TR_064.States.serialnumber`;
                            if (val.newserialnumber) {
                                if (!this.checkvalue[state] || this.checkvalue[state] != val.newserialnumber) {
                                    this.checkvalue[state] = val.newserialnumber;
                                    await this.adapter.setStateAsync(state, val.newserialnumber, true);
                                }
                            }
                            state = `${this.config.dp}.TR_064.States.firmware`;
                            if (val.newsoftwareversion) {
                                if (!this.checkvalue[state] || this.checkvalue[state] != val.newsoftwareversion) {
                                    this.checkvalue[state] = val.newsoftwareversion;
                                    await this.adapter.setStateAsync(state, val.newsoftwareversion.toString(), true);
                                }
                            }
                            state = `${this.config.dp}.TR_064.States.uptime`;
                            if (val.newuptime) {
                                if (!this.checkvalue[state] || this.checkvalue[state] != val.newuptime) {
                                    this.checkvalue[state] = val.newuptime;
                                    await this.adapter.setStateAsync(state, parseInt(val.newuptime), true);
                                }
                            }
                        }
                        if (val.newdevicelog) {
                            const protocol = val.newdevicelog.split("\n");
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
                                if (
                                    !this.checkvalue[state] ||
                                    this.checkvalue[state] != JSON.stringify(protocol_array)
                                ) {
                                    this.checkvalue[state] = JSON.stringify(protocol_array);
                                    await this.adapter.setStateAsync(state, JSON.stringify(protocol_array), true);
                                }
                            }
                        }
                    }
                    return true;
                })
                .catch((err) => {
                    this.adapter.log.warn(err);
                    return false;
                });
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
                .then(async (result) => {
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
                                await this.adapter.setStateAsync(
                                    `${this.config.dp}.TR_064.States.externalIPv4`,
                                    val.newexternalipaddress.toString(),
                                    true,
                                );
                            }
                        }
                        state = `${this.config.dp}.TR_064.States.externalIPv6`;
                        if (val.newdnsservers) {
                            if (!this.checkvalue[state] || this.checkvalue[state] != val.newdnsservers) {
                                this.checkvalue[state] = val.newdnsservers;
                                const ips = val.newdnsservers.split(", ");
                                await this.adapter.setStateAsync(state, ips[0], true);
                                await this.adapter.setStateAsync(
                                    `${this.config.dp}.TR_064.States.externalIPv6Prefix`,
                                    ips[1],
                                    true,
                                );
                            }
                        }
                        state = `${this.config.dp}.TR_064.States.mac`;
                        if (val.newmacaddress) {
                            if (!this.checkvalue[state] || this.checkvalue[state] != val.newmacaddress) {
                                this.checkvalue[state] = val.newmacaddress;
                                await this.adapter.setStateAsync(state, val.newmacaddress, true);
                            }
                        }
                        state = `${this.config.dp}.TR_064.States.upstream`;
                        if (val.newupstreammaxbitrate) {
                            if (!this.checkvalue[state] || this.checkvalue[state] != val.newupstreammaxbitrate) {
                                this.checkvalue[state] = val.newupstreammaxbitrate;
                                await this.adapter.setStateAsync(state, parseInt(val.newupstreammaxbitrate), true);
                            }
                        }
                        state = `${this.config.dp}.TR_064.States.downstream`;
                        if (val.newdownstreammaxbitrate) {
                            if (!this.checkvalue[state] || this.checkvalue[state] != val.newdownstreammaxbitrate) {
                                this.checkvalue[state] = val.newdownstreammaxbitrate;
                                await this.adapter.setStateAsync(state, parseInt(val.newdownstreammaxbitrate), true);
                            }
                        }
                        state = `${this.config.dp}.TR_064.States.status`;
                        if (val.newconnectionstatus) {
                            if (!this.checkvalue[state] || this.checkvalue[state] != val.newconnectionstatus) {
                                this.checkvalue[state] = val.newconnectionstatus;
                                await this.adapter.setStateAsync(state, val.newconnectionstatus, true);
                            }
                        }
                        state = `${this.config.dp}.TR_064.States.error`;
                        if (val.newlastconnectionerror) {
                            if (!this.checkvalue[state] || this.checkvalue[state] != val.newlastconnectionerror) {
                                this.checkvalue[state] = val.newlastconnectionerror;
                                await this.adapter.setStateAsync(state, val.newlastconnectionerror, true);
                            }
                        }
                    }
                    return true;
                })
                .catch((err) => {
                    this.adapter.log.warn(err);
                    return false;
                });
        }
        this.adapter.setState(`${this.config.dp}.TR_064.States.lastupdate`, Date.now(), true);
    }

    destroy() {
        this.updateInterval && this.adapter.clearInterval(this.updateInterval);
    }

    /**
     * @param {string} fritz
     * @param {string} state
     * @param {object | null | undefined} obj
     */
    async sendCommand(fritz, state, obj) {
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
            const device = this.services.find((dev) => dev.servicetype === val.service);
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
                    const path = response.toString().match("<" + val.tag + ">(.*?)</" + val.tag + ">");
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
                        .then((result) => {
                            return result;
                        })
                        .catch((err) => {
                            return { error: err };
                        });
                    if (val.html) {
                        response = entities.decodeHTML(response.toString());
                    }
                } else {
                    resp = response;
                }
                this.adapter.setState(`${this.config.dp}.TR_064.States.responseXML`, response.toString(), true);
                if (obj != null) {
                    this.adapter.sendTo(obj.from, obj.command, JSON.stringify(resp), obj.callback);
                }
            }
        } else {
            if (obj != null) {
                this.adapter.sendTo(obj.from, obj.command, resp, obj.callback);
            }
        }
        this.adapter.setState(`${this.config.dp}.TR_064.States.response`, JSON.stringify(resp), true);
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
            (out) => {
                this.adapter.log.debug("OUT: " + out.stdout + " - " + out.stderr);
                try {
                    if (out.stdout) {
                        return out.stdout;
                    } else {
                        if (out.stdout.toString().indexOf("Unauthorized") !== -1) {
                            return "Unauthorized";
                        }
                        return out.stdout;
                    }
                } catch (e) {
                    this.adapter.log.debug(`catch exec: ${JSON.stringify(e)}`);
                    return false;
                }
            },
            (err) => {
                this.adapter.log.debug(`requests: ${JSON.stringify(err)}`);
                return false;
            },
        );
    }
}

module.exports = TR064;
