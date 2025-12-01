"use strict";

/*
 * Created with @iobroker/create-adapter v2.5.0
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require("@iobroker/adapter-core");
const apiFB = require("./lib/api");
const monitorFB = require("./lib/callmonitor.js");
const helper = require("./lib/helper");
const constants = require("./lib/constants");
const macmonitor = require("./lib/mac");
const tr064 = require("./lib/tr-064");
const axios = require("./lib/request");

class Fritzboxdect extends utils.Adapter {
    /**
     * @param {Partial<utils.AdapterOptions>} [options={}]
     */
    constructor(options) {
        super({
            ...options,
            name: "fritzboxdect",
        });
        this.on("ready", this.onReady.bind(this));
        this.on("stateChange", this.onStateChange.bind(this));
        // this.on("objectChange", this.onObjectChange.bind(this));
        this.on("message", this.onMessage.bind(this));
        this.on("unload", this.onUnload.bind(this));
        this.createDataPoint = helper.createDataPoint;
        this.createDevice = helper.createDevice;
        this.createChannels = helper.createChannels;
        this.createColorTemplate = helper.createColorTemplate;
        this.createCallmonitor = helper.createCallmonitor;
        this.createCallLog = helper.createCallLog;
        this.createPhonebook = helper.createPhonebook;
        this.createAbsence = helper.createAbsence;
        this.createAbsenceFolder = helper.createAbsenceFolder;
        this.createStateTR064 = helper.createStateTR064;
        this.createStateEnergyTR064 = helper.createStateEnergyTR064;
        this.sleepTimer = null;
        this.dect_device = {};
        this.clients = {};
        this.double_call = {};
        this.deviceCheck = null;
        this.lang = "de";
        this.viewdebug = false;
        this.country = {};
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     *
     */
    async onReady() {
        await this.setState("info.connection", { val: false, ack: true });
        const isChange = await this.configcheck();
        if (isChange) {
            this.log.info(`Encrypt Passwords and restart Adapter!`);
            return;
        }
        await this.subscribeStatesAsync("*");
        const obj = await this.getForeignObjectAsync("system.config");
        if (obj && obj.common && obj.common.language) {
            try {
                this.lang = obj.common.language === this.lang ? this.lang : obj.common.language;
            } catch {
                this.lang = "de";
            }
        }
        let check_name = {};
        const config_array = this.config.icons;
        if (Object.keys(config_array).length > 0) {
            for (const jsons of config_array) {
                if (check_name[jsons.iconname]) {
                    this.log.error(`Duplicate icon name - ${jsons.iconname}!!!`);
                }
                check_name[jsons.iconname] = jsons.iconname;
            }
        }
        let devices = [];
        try {
            devices = typeof this.config.fritz === "object" ? JSON.parse(JSON.stringify(this.config.fritz)) : [];
        } catch {
            devices = [];
        }
        check_name = {};
        if (devices && Object.keys(devices).length === 0) {
            this.log.info(`No Fritzbox created!`);
            return;
        }
        for (const dev of devices) {
            if (dev.dect_interval == null || dev.dect_interval < 1) {
                dev.dect_interval = 1;
            }
            if (dev.temp_interval == null) {
                dev.temp_interval = 0;
            }
            if (dev.activ != null && !dev.activ) {
                this.log.info(`Fritbox ${dev.ip} is disabled!`);
                continue;
            }
            if (dev.ip == "") {
                this.log.warn(`Missing Fritzbox IP!`);
                continue;
            }
            if (dev.user == "") {
                this.log.warn(`Missing User!`);
                continue;
            }
            if (dev.password != "" && dev.password.includes("<LUCKY-ESA>")) {
                try {
                    const decrypt_pw = dev.password.split("<LUCKY-ESA>")[1];
                    if (decrypt_pw != "") {
                        dev.password = this.decrypt(decrypt_pw);
                    } else {
                        this.log.warn(`Cannot found password!`);
                        continue;
                    }
                } catch {
                    this.log.warn(`Missing User Password!`);
                    continue;
                }
            } else if (dev.password == "") {
                this.log.warn(`Missing User Password!`);
                continue;
            }
            if (check_name[dev.ip]) {
                this.log.error(`Duplicate IP ${dev.ip} is not allowed!!!`);
                continue;
            }
            if (dev.booster === 0) {
                dev.booster = 5;
            }
            if (dev.open === 0) {
                dev.open = 5;
            }
            check_name[dev.ip] = dev.ip;
            dev.status = false;
            dev.dp = this.forbidden_ip(dev.ip);
            const dev_monitor = {
                dp: dev.dp,
                password: dev.password,
                ip: dev.ip,
                dect_interval: dev.dect_interval,
                calllist: dev.calllist,
                activ: dev.activ,
                user: dev.user,
                mac: this.config.macs,
                interval: this.config.max_interval,
                tr_interval: dev.tr_interval,
                phone: dev.phone,
                protocol: dev.protocol,
                temp_interval: dev.temp_interval,
                rights: {},
            };
            dev.tr064 = new tr064(dev_monitor, this);
            dev.rights = await dev.tr064.loadRights();
            dev_monitor.rights = dev.rights;
            dev.apiFritz = new apiFB(dev_monitor, this);
            dev.monitorFB = new monitorFB(dev_monitor, this, constants.states);
            dev.monitorMAC = new macmonitor(dev_monitor, this);
            dev.apiFritz.on("status", this.status_fritz.bind(this));
            dev.apiFritz.on("data", this.data_fritz.bind(this));
            dev.apiFritz.on("dect", this.dect_fritz.bind(this));
            if (this.config.max_interval > 0) {
                const ismonitor = dev.monitorMAC.start();
                if (!ismonitor) {
                    await this.delObjectAsync(`${dev.dp}.Presence`, { recursive: true });
                }
            } else {
                await this.delObjectAsync(`${dev.dp}.Presence`, { recursive: true });
            }
            const online = await dev.apiFritz.osversion();
            if (online === 0) {
                this.log.warn(`Fritzbox ${dev.ip} cannot be reached - ${JSON.stringify(online)}`);
                return;
            }
            dev.status = true;
            let login;
            this.log.info(`Create TR-064 States folder.`);
            await this.createStateTR064(dev);
            // TODO Fiber Box have no Energymonitoring
            await this.createStateEnergyTR064(dev);
            login = await dev.apiFritz.login();
            if (login === "BLOCK") {
                login = await dev.apiFritz.login();
            }
            if (login) {
                this.log.info(`Connected to Fritzbox ${dev.ip} - Create device!`);
                await this.createDevice(dev, login);
                if (dev.call) {
                    this.log.info(`Create Callmonitor folder.`);
                    await this.createCallmonitor(dev);
                } else {
                    await this.delObjectAsync(`${dev.dp}.TR_064.Callmonitor`, { recursive: true });
                }
                if (dev.call && dev.calllist > 0) {
                    if (dev.calllist > 100) {
                        dev.calllist = 100;
                    }
                    this.log.info(`Create Call logs folder.`);
                    await this.createCallLog(dev);
                } else {
                    await this.delObjectAsync(`${dev.dp}.TR_064.Calllists`, { recursive: true });
                }
                if (dev.call && dev.phone > 0) {
                    if (dev.calllist > 100) {
                        dev.calllist = 100;
                    }
                    this.log.info(`Create phonebook folder.`);
                    await this.createPhonebook(dev);
                } else {
                    await this.delObjectAsync(`${dev.dp}.TR_064.Phonebooks`, { recursive: true });
                }
                const devices = await dev.apiFritz.fritzRequest(
                    "GET",
                    "/webservices/homeautoswitch.lua?switchcmd=getdevicelistinfos&sid=",
                    "device",
                );
                if (devices && devices.devicelist && devices.devicelist.device) {
                    this.log.info(`DECT Datapoints for device ${dev.ip} are created/updated`);
                    this.log.debug(`DEVICELIST ${JSON.stringify(devices.devicelist.device)}`);
                    await this.createChannels(dev, devices.devicelist.device, constants, "DECT");
                }
                if (devices && devices.devicelist && devices.devicelist.group) {
                    this.log.info(`Group Datapoints for device ${dev.ip} are created/updated`);
                    this.log.debug(`DEVICEGROUP ${JSON.stringify(devices.devicelist.group)}`);
                    await this.createChannels(dev, devices.devicelist.group, constants, "GROUP");
                }
                const template = await dev.apiFritz.fritzRequest(
                    "GET",
                    "/webservices/homeautoswitch.lua?switchcmd=gettemplatelistinfos&sid=",
                    "template",
                );
                if (template && template.templatelist && template.templatelist.template) {
                    this.log.info(`Template Datapoints for device ${dev.ip} are created/updated`);
                    this.log.debug(`TEMPLATE ${JSON.stringify(template.templatelist.template)}`);
                    await this.createChannels(dev, template.templatelist.template, constants, "TEMPLATE");
                }
                const trigger = await dev.apiFritz.fritzRequest(
                    "GET",
                    "/webservices/homeautoswitch.lua?switchcmd=gettriggerlistinfos&sid=",
                    "trigger",
                );
                if (trigger && trigger.triggerlist && trigger.triggerlist.trigger) {
                    this.log.info(`Trigger Datapoints for device ${dev.ip} are created/updated`);
                    this.log.debug(`TRIGGER ${JSON.stringify(trigger.triggerlist.trigger)}`);
                    await this.createChannels(dev, trigger.triggerlist.trigger, constants, "TRIGGER");
                }
                await this.setState("info.connection", { val: true, ack: true });
            }
            dev.tr064.start();
            this.clients[dev.dp] = dev;
            this.clients[dev.dp].apiFritz.start();
            if (dev.call) {
                this.clients[dev.dp].monitorFB.connect();
            }
        }
        this.deviceCheck = this.setInterval(
            async () => {
                await this.checkDeviceFolder();
                this.checkDevices();
            },
            60 * 1000 * 60 * 24,
        );
        this.checkDevices();
    }

    async axiosRequest(dev) {
        const options_axios = {
            protocol: dev.protocol,
            ip: dev.ip,
            url: dev.link,
            header: { SoapAction: `${dev.service}#${dev.action}` },
            publicKey: dev.user,
            privateKey: dev.password,
            method: dev.method,
            data:
                '<?xml version="1.0" encoding="utf-8"?>' +
                '<s:Envelope s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/"' +
                '    xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">' +
                "<s:Body>" +
                `<u:${dev.action} xmlns:u="${dev.service}">` +
                `${dev.addNew}` +
                `</u:${dev.action}></s:Body></s:Envelope>`,
        };
        return await axios(options_axios);
    }

    async checkDevices() {
        this.log.info(`Start device check.`);
        const channels = await this.getChannelsAsync();
        const channels_array = channels.map(entry => entry._id);
        const channels_fritz = [];
        for (const id in this.clients) {
            let device_array = [];
            const devices = await this.clients[id].apiFritz.fritzRequest(
                "GET",
                "/webservices/homeautoswitch.lua?switchcmd=getdevicelistinfos&sid=",
                "device",
            );
            if (devices && devices.devicelist && devices.devicelist.device) {
                if (Object.keys(devices.devicelist.device).length == 0) {
                    return;
                } else if (Object.keys(devices.devicelist.device).length == 1) {
                    device_array.push(devices.devicelist.device);
                } else {
                    device_array = devices.devicelist.device;
                }
                for (const device of device_array) {
                    if (device.functionbitmask != 1) {
                        const ident = `DECT_${device.identifier.replace(/\s/g, "").replace(/-1/g, "")}`;
                        const path = `${this.namespace}.${this.clients[id].dp}.${ident}`;
                        channels_fritz.push(path);
                    }
                }
            }
            if (devices && devices.devicelist && devices.devicelist.group) {
                if (Object.keys(devices.devicelist.group).length == 0) {
                    return;
                } else if (Object.keys(devices.devicelist.group).length == 1) {
                    device_array.push(devices.devicelist.group);
                } else {
                    device_array = devices.devicelist.group;
                }
                for (const device of device_array) {
                    if (device.functionbitmask != 1) {
                        const ident = `GROUP_${device.identifier.replace(/\s/g, "").replace(/-1/g, "")}`;
                        const path = `${this.namespace}.${this.clients[id].dp}.${ident}`;
                        channels_fritz.push(path);
                    }
                }
            }
            const template = await this.clients[id].apiFritz.fritzRequest(
                "GET",
                "/webservices/homeautoswitch.lua?switchcmd=gettemplatelistinfos&sid=",
                "template",
            );
            if (template && template.templatelist && template.templatelist.template) {
                if (Object.keys(template.templatelist.template).length == 0) {
                    return;
                } else if (Object.keys(template.templatelist.template).length == 1) {
                    device_array.push(template.templatelist.template);
                } else {
                    device_array = template.templatelist.template;
                }
                for (const device of device_array) {
                    if (device.functionbitmask != 1) {
                        const ident = `TEMPLATE_${device.identifier.replace(/\s/g, "").replace(/-1/g, "")}`;
                        const path = `${this.namespace}.${this.clients[id].dp}.${ident}`;
                        channels_fritz.push(path);
                    }
                }
            }
            const trigger = await this.clients[id].apiFritz.fritzRequest(
                "GET",
                "/webservices/homeautoswitch.lua?switchcmd=gettriggerlistinfos&sid=",
                "trigger",
            );
            if (trigger && trigger.triggerlist && trigger.triggerlist.trigger) {
                if (Object.keys(trigger.triggerlist.trigger).length == 0) {
                    return;
                } else if (Object.keys(trigger.triggerlist.trigger).length == 1) {
                    device_array.push(trigger.triggerlist.trigger);
                } else {
                    device_array = trigger.triggerlist.trigger;
                }
                for (const device of device_array) {
                    if (device.functionbitmask != 1) {
                        const ident = `TRIGGER_${device.identifier.replace(/\s/g, "").replace(/-1/g, "")}`;
                        const path = `${this.namespace}.${this.clients[id].dp}.${ident}`;
                        channels_fritz.push(path);
                    }
                }
            }
            for (const device of channels_array) {
                if (channels_fritz.includes(device)) {
                    this.log.debug(`Found channel ${device}`);
                } else {
                    if (device != `${this.namespace}.info`) {
                        this.log.debug(`Cannot found channel - Delete ${device}`);
                        //await this.delObjectAsync(device, { recursive: true });
                    }
                }
            }
        }
    }

    async dect_fritz(dp, dp_name, devices) {
        await this.createChannels(this.clients[dp], devices, constants, dp_name);
        const channels = await this.getChannelsAsync();
        const channels_array = channels.map(entry => entry._id);
        this.log.debug(`All channels ${JSON.stringify(channels_array)}`);
        this.log.debug(`DP ${dp}`);
        if (this.clients[dp]) {
            this.clients[dp].updateChannel(channels_array);
        } else {
            this.log.error(`Cannot found ${dp}. Please restart adapter!`);
        }
    }

    /**
     * configcheck
     */
    async configcheck() {
        try {
            let isdecode = false;
            const adapterconfigs = await this.getForeignObjectAsync(`system.adapter.${this.namespace}`);
            if (adapterconfigs && adapterconfigs.native && adapterconfigs.native.fritz) {
                for (const pw of adapterconfigs.native.fritz) {
                    if (pw.password != "" && !pw.password.includes("<LUCKY-ESA>")) {
                        pw.password = `<LUCKY-ESA>${this.encrypt(pw.password)}`;
                        isdecode = true;
                    }
                }
            }
            if (isdecode) {
                if (adapterconfigs && adapterconfigs.native.fritz[0] === null) {
                    adapterconfigs.native.hosts = [];
                }
                await this.extendForeignObjectAsync(`system.adapter.${this.namespace}`, {
                    native: adapterconfigs ? adapterconfigs.native : [],
                });
                return true;
            }
            return false;
        } catch {
            this.log.warn(`Cannot encrypt all passwords!!!`);
        }
    }

    /**
     * checkDeviceFolder
     */
    async checkDeviceFolder() {
        try {
            this.log.info(`Start check devices object!`);
            const devices = await this.getDevicesAsync();
            for (const element of devices) {
                const id = element["_id"].split(".").pop();
                if (this.clients[id]) {
                    this.log.debug(`Found device ${element["_id"]}`);
                } else {
                    this.log.info(`Delete device ${element["_id"]}`);
                    await this.delObjectAsync(`${id}`, { recursive: true });
                }
            }
        } catch (e) {
            this.log.error(`checkDeviceFolder: ${e}`);
        }
    }

    forbidden_ip(ip) {
        return ip.replace(/[.]/gu, "_").replace(this.FORBIDDEN_CHARS, "_");
    }

    status_fritz(dp, ident, status) {
        if (this.clients[dp] != null) {
            if (this.clients[dp][ident] == null) {
                this.clients[dp][ident] = {};
            }
            this.clients[dp][ident].status = status;
        }
    }

    data_fritz() {}

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     *
     * @param {() => void} callback
     */
    onUnload(callback) {
        try {
            this.deviceCheck && this.clearInterval(this.deviceCheck);
            this.sleepTimer && this.clearTimeout(this.sleepTimer);
            this.deviceCheck = null;
            for (const id in this.clients) {
                this.clients[id].apiFritz.destroy();
                this.clients[id].monitorMAC.destroy();
                this.clients[id].tr064.destroy();
                if (this.clients[id].call) {
                    this.clients[id].monitorFB.destroy();
                }
            }
            callback();
        } catch {
            callback();
        }
    }

    // If you need to react to object changes, uncomment the following block and the corresponding line in the constructor.
    // You also need to subscribe to the objects with `this.subscribeObjects`, similar to `this.subscribeStates`.
    // /**
    //  * Is called if a subscribed object changes
    //  * @param {string} id
    //  * @param {ioBroker.Object | null | undefined} obj
    //  */
    // onObjectChange(id, obj) {
    //     if (obj) {
    //         // The object was changed
    //         this.log.info(`object ${id} changed: ${JSON.stringify(obj)}`);
    //     } else {
    //         // The object was deleted
    //         this.log.info(`object ${id} deleted`);
    //     }
    // }

    /**
     * Is called if a subscribed state changes
     *
     * @param {string} id
     * @param {ioBroker.State | null | undefined} state
     */
    onStateChange(id, state) {
        if (state && !state.ack) {
            const id_ack = id;
            const lastsplit = id.split(".").pop();
            const fritz = id.split(".")[2];
            const device = id.split(".")[3];
            if (!this.clients[fritz]) {
                return;
            }
            if (lastsplit === "fritz_monitor_update") {
                this.clients[fritz].apiFritz.loadMonitor();
                this.setAckFlag(id_ack, { val: false });
                return;
            }
            if (lastsplit === "getsubscriptionstate") {
                this.clients[fritz].apiFritz.getStatusULE();
                this.setAckFlag(id_ack, { val: false });
                return;
            }
            if (lastsplit === "startulesubscription") {
                this.clients[fritz].apiFritz.getCommand("GET", `&switchcmd=startulesubscription`, id_ack, state.val);
                this.setAckFlag(id_ack);
                return;
            }
            if (lastsplit === "sendCommand") {
                this.clients[fritz].tr064.sendCommand(fritz, state.val, null, null);
                this.setAckFlag(id_ack);
                return;
            }
            if (lastsplit === "sendHTTPRequest") {
                this.clients[fritz].apiFritz.sendHTTP(fritz, state.val, null);
                this.setAckFlag(id_ack);
                return;
            }
            if (device === "TR_064") {
                switch (lastsplit) {
                    case "wlan24":
                        this.clients[fritz].tr064.setWlan(1, state.val);
                        this.setAckFlag(id_ack, { val: "" });
                        break;
                    case "wlan50":
                        this.clients[fritz].tr064.setWlan(2, state.val);
                        this.setAckFlag(id_ack, { val: "" });
                        break;
                    case "wlan60":
                        this.clients[fritz].tr064.setWlan(3, state.val);
                        this.setAckFlag(id_ack, { val: "" });
                        break;
                    case "wlan70":
                        this.clients[fritz].tr064.setWlan(4, state.val);
                        this.setAckFlag(id_ack, { val: "" });
                        break;
                    case "wlanguest":
                        this.clients[fritz].tr064.setWlan(5, state.val);
                        this.setAckFlag(id_ack, { val: "" });
                        break;
                    case "wlan24name":
                        this.clients[fritz].tr064.setWlanName(1, state.val);
                        this.setAckFlag(id_ack, { val: "" });
                        break;
                    case "wlan50name":
                        this.clients[fritz].tr064.setWlanName(2, state.val);
                        this.setAckFlag(id_ack, { val: "" });
                        break;
                    case "wlan60name":
                        this.clients[fritz].tr064.setWlanName(3, state.val);
                        this.setAckFlag(id_ack, { val: "" });
                        break;
                    case "wlan70name":
                        this.clients[fritz].tr064.setWlanName(4, state.val);
                        this.setAckFlag(id_ack, { val: "" });
                        break;
                    case "wlanguestname":
                        this.clients[fritz].tr064.setWlanName(5, state.val);
                        this.setAckFlag(id_ack, { val: "" });
                        break;
                    case "wlan24PW":
                        this.clients[fritz].tr064.setWlanPW(1, state.val);
                        this.setAckFlag(id_ack, { val: "" });
                        break;
                    case "wlan50PW":
                        this.clients[fritz].tr064.setWlanPW(2, state.val);
                        this.setAckFlag(id_ack, { val: "" });
                        break;
                    case "wlan60PW":
                        this.clients[fritz].tr064.setWlanPW(3, state.val);
                        this.setAckFlag(id_ack, { val: "" });
                        break;
                    case "wlan70PW":
                        this.clients[fritz].tr064.setWlanPW(4, state.val);
                        this.setAckFlag(id_ack, { val: "" });
                        break;
                    case "wlanGuestPW":
                        this.clients[fritz].tr064.setWlanPW(5, state.val);
                        this.setAckFlag(id_ack, { val: "" });
                        break;
                    default:
                        // nothing
                        break;
                }
                return;
            }
            this.sendcommand(id, state, String(lastsplit), fritz, device);
        }
    }

    /**
     * @param {string} id
     * @param {ioBroker.State | null | undefined} state
     * @param {string} lastsplit
     * @param {string} fritz
     * @param {string} device
     */
    async sendcommand(id, state, lastsplit, fritz, device) {
        try {
            const id_ack = id;
            if (state == null) {
                return;
            }
            if (state.val == null) {
                return;
            }
            if (device === "DECT_Control") {
                if (lastsplit.startsWith("DECT_")) {
                    this.setAckFlag(id_ack);
                    return;
                }
                switch (lastsplit) {
                    case "own_request":
                        this.own_request(id, fritz, state.val);
                        break;
                    case "createColorTemplates":
                        this.createColorTemplates(id_ack, fritz);
                        break;
                    case "createTemperatureTemplates":
                        this.createTemperatureTemplates(id_ack, fritz);
                        break;
                    case "hue_template":
                    case "colorTemperature_template":
                    case "levelPercentage_template":
                    case "name_template":
                    case "saturation_template":
                        this.setAckFlag(id_ack);
                        break;
                    case "colorpreset":
                        this.setAckFlag(id_ack, { val: false });
                        break;
                    default:
                        // nothing
                        break;
                }
                return;
            }
            if (
                (!this.clients[fritz][device] || !this.clients[fritz][device].status) &&
                (lastsplit.startsWith("DECT_") || lastsplit.startsWith("GROUP_"))
            ) {
                this.log.info(`Device ${device} is Offline`);
                return;
            }
            const folder = id.split(".")[4];
            this.log.info(`sendFromChannel: ${fritz}.${device}.identifier`);
            const device_Id = await this.getStateAsync(`${fritz}.${device}.identifier`);
            if (device_Id == null || typeof device_Id["val"] != "string" || device_Id["val"] == null) {
                this.log.info(`Cannot found identifier!`);
                return;
            }
            const deviceId = encodeURIComponent(device_Id["val"]);
            let actemp;
            if (lastsplit === "tsoll") {
                const nexttemp = await this.getStateAsync(`${fritz}.${device}.hkr.nextchange.tchange`);
                const absenk = await this.getStateAsync(`${fritz}.${device}.hkr.absenk`);
                const komfort = await this.getStateAsync(`${fritz}.${device}.hkr.komfort`);
                if (nexttemp == null || absenk == null || komfort == null || komfort.val == null) {
                    this.log.info(`Cannot set tsoll!`);
                    return;
                }
                komfort.val = typeof komfort.val === "string" ? parseFloat(komfort.val) : komfort.val;
                if (typeof komfort.val != "number" || typeof absenk.val != "number") {
                    return;
                }
                if (nexttemp.val === absenk.val) {
                    actemp = komfort.val * 2;
                } else if (nexttemp.val === komfort.val) {
                    actemp = absenk.val * 2;
                } else {
                    actemp = absenk.val * 2;
                }
            }
            let dummy;
            let button_val;
            let sendstr = "";
            let tsoll = 0;
            let type_val;
            let icon_val;
            let len_meta = 0;
            const meta = {};
            if (lastsplit === "setMetadata") {
                icon_val = await this.getStateAsync(`${fritz}.${device}.metadata.icon`);
                type_val = await this.getStateAsync(`${fritz}.${device}.metadata.type`);
                if (
                    type_val &&
                    type_val.val != null &&
                    (type_val.val == "coming" || type_val.val == "leaving" || type_val.val == "generic")
                ) {
                    meta["type"] = type_val.val;
                }
                if (
                    icon_val &&
                    icon_val.val != null &&
                    typeof icon_val.val === "number" &&
                    (icon_val.val == 0 || icon_val.val > 0)
                ) {
                    meta["icon"] = icon_val.val;
                }
                len_meta = Object.keys(meta).length;
            }
            switch (lastsplit) {
                case "type":
                case "icon":
                    this.setAckFlag(id_ack);
                    break;
                case "setMetadata":
                    if (len_meta > 0) {
                        sendstr = `ain=${deviceId}&switchcmd=setmetadata&metadata=${JSON.stringify(meta)}&sid=`;
                        this.setAckFlag(id_ack, { val: false });
                    }
                    break;
                case "getTemperatureStatistic":
                case "getStatistic":
                    this.clients[fritz].apiFritz.getStatistic(
                        "GET",
                        `switchcmd=getbasicdevicestats&ain=${deviceId}&sid=`,
                        `${fritz}.${device}`,
                        constants,
                    );
                    this.setAckFlag(id_ack, { val: false });
                    break;
                case "getColor":
                    this.clients[fritz].apiFritz.getStatistic(
                        "GET",
                        `switchcmd=getcolordefaults&ain=${deviceId}&sid=`,
                        `${fritz}.${device}`,
                        constants,
                    );
                    this.setAckFlag(id_ack, { val: false });
                    break;
                case "hex":
                    dummy = this.hex_to_rgb(state.val);
                    this.setStateHex(dummy, id_ack);
                    sendstr = `ain=${deviceId}&switchcmd=setcolor&hue=${dummy[0]}&saturation=${dummy[1]}&duration=100&sid=`;
                    break;
                case "tsoll":
                    tsoll = parseInt(state.val.toString());
                    if (tsoll > 7 && tsoll < 32) {
                        dummy = tsoll * 2;
                    } else if (state.val === 254 || state.val === 2) {
                        dummy = 254;
                    } else if (state.val === 0) {
                        dummy = actemp;
                    } else if (state.val === 253 || state.val === 1) {
                        dummy = 253;
                    }
                    if (dummy != null && dummy > 0) {
                        sendstr = `ain=${deviceId}&switchcmd=sethkrtsoll&param=${dummy}&sid=`;
                    }
                    break;
                case "temperature":
                    state.val = parseInt(state.val.toString());
                    if (state.val > 6200) {
                        dummy = 6500;
                    } else if (state.val > 5600) {
                        dummy = 5900;
                    } else if (state.val > 5000) {
                        dummy = 5300;
                    } else if (state.val > 4500) {
                        dummy = 4700;
                    } else if (state.val > 4000) {
                        dummy = 4200;
                    } else if (state.val > 3600) {
                        dummy = 3800;
                    } else if (state.val > 3200) {
                        dummy = 3400;
                    } else if (state.val > 2850) {
                        dummy = 3000;
                    } else {
                        dummy = 2700;
                    }
                    sendstr = `ain=${deviceId}&switchcmd=setcolortemperature&temperature=${dummy}&duration=100&sid=`;
                    break;
                case "hue":
                    dummy = await this.getStateAsync(`${fritz}.${device}.colorcontrol.saturation`);
                    if (dummy && dummy.val != null) {
                        sendstr = `ain=${deviceId}&switchcmd=setcolor&hue=${state.val}&saturation=${dummy.val}&duration=100&sid=`;
                    }
                    break;
                case "saturation":
                    //dummy = await this.getStateAsync(`${fritz}.${device}.colorcontrol.hue`);
                    //if (dummy && dummy.val != null) {
                    //    sendstr = `ain=${deviceId}&switchcmd=setcolor&hue=${dummy.val}&saturation=${state.val}&duration=100&sid=`;
                    //}
                    this.setAckFlag(id_ack);
                    break;
                case "unmapped_hue":
                    dummy = await this.getStateAsync(`${fritz}.${device}.colorcontrol.unmapped_saturation`);
                    if (dummy && dummy.val != null) {
                        sendstr = `ain=${deviceId}&switchcmd=setunmappedcolor&hue=${state.val}&saturation=${dummy.val}&duration=100&sid=`;
                    }
                    break;
                case "unmapped_saturation":
                    //dummy = await this.getStateAsync(`${fritz}.${device}.colorcontrol.unmapped_hue`);
                    //if (dummy && dummy.val != null) {
                    //    sendstr = `ain=${deviceId}&switchcmd=setunmappedcolor&hue=${dummy.val}&saturation=${state.val}&duration=100&sid=`;
                    //}
                    this.setAckFlag(id_ack);
                    break;
                case "level":
                    state.val = parseInt(state.val.toString());
                    if (state.val >= 0 && state.val <= 255) {
                        sendstr = `ain=${deviceId}&switchcmd=setlevel&level=${state.val}&sid=`;
                    }
                    break;
                case "levelpercentage":
                    state.val = parseInt(state.val.toString());
                    if (state.val >= 0 && state.val <= 100) {
                        sendstr = `ain=${deviceId}&switchcmd=setlevelpercentage&level=${state.val}&sid=`;
                    }
                    break;
                case "blindstop":
                    if (state.val) {
                        sendstr = `ain=${deviceId}&switchcmd=setblind&target=stop&sid=`;
                    }
                    this.setAckFlag(id_ack, { val: false });
                    break;
                case "blindopen":
                    if (state.val) {
                        sendstr = `ain=${deviceId}&switchcmd=setblind&target=open&sid=`;
                    }
                    this.setAckFlag(id_ack, { val: false });
                    break;
                case "blindclose":
                    if (state.val) {
                        sendstr = `ain=${deviceId}&switchcmd=setblind&target=close&sid=`;
                    }
                    this.setAckFlag(id_ack, { val: false });
                    break;
                case "blindlevel":
                    state.val = parseInt(state.val.toString());
                    if (state.val >= 0 && state.val <= 100) {
                        sendstr = `ain=${deviceId}&switchcmd=setlevelpercentage&level=${state.val}&sid=`;
                    }
                    break;
                case "blindvalue":
                    state.val = parseInt(state.val.toString());
                    if (state.val >= 0 && state.val <= 100) {
                        dummy = 100 - state.val;
                        sendstr = `ain=${deviceId}&switchcmd=setlevelpercentage&level=${dummy}&sid=`;
                    }
                    break;
                case "name":
                    if (folder === "button") {
                        button_val = id.split(".")[5];
                        dummy = await this.getStateAsync(`${fritz}.${device}.${folder}.${button_val}.identifier`);
                        if (dummy != null && dummy.val != null) {
                            this.extendObject(`${fritz}.${device}.${folder}.${button_val}`, {
                                common: { name: state.val.toString(), desc: state.val.toString() },
                            });
                            sendstr = `ain=${encodeURIComponent(dummy.val)}&switchcmd=setname&name=${encodeURIComponent(
                                state.val,
                            )}&sid=`;
                        }
                    } else {
                        sendstr = `ain=${deviceId}&switchcmd=setname&name=${encodeURIComponent(state.val)}&sid=`;
                        this.extendObject(`${fritz}.${device}`, {
                            common: { name: state.val.toString(), desc: state.val.toString() },
                        });
                    }
                    break;
                case "state":
                    if (folder === "simpleonoff") {
                        if (state.val === 2) {
                            dummy = "setswitchtoggle";
                        } else {
                            dummy = `setsimpleonoff&onoff=${state.val}`;
                        }
                    } else if (folder === "switch") {
                        dummy = state.val ? "setswitchon" : "setswitchoff";
                    }
                    if (dummy !== null) {
                        sendstr = `ain=${deviceId}&switchcmd=${dummy}&sid=`;
                    }
                    break;
                case "stateonoff":
                    dummy = state.val ? "setswitchon" : "setswitchoff";
                    sendstr = `ain=${deviceId}&switchcmd=${dummy}&sid=`;
                    break;
                case "boostactive":
                    dummy = Math.floor(Date.now() / 1000);
                    dummy = this.clients[fritz].booster * 60 + dummy;
                    sendstr = `ain=${deviceId}&switchcmd=sethkrboost&endtimestamp=${dummy}&sid=`;
                    this.setAckFlag(id_ack, { val: false });
                    break;
                case "boostactiveendtime":
                    state.val = parseInt(state.val.toString());
                    dummy = Math.floor(Date.now() / 1000);
                    if (state.val > 0 && state.val < 1441) {
                        dummy = state.val * 60 + dummy;
                        sendstr = `ain=${deviceId}&switchcmd=sethkrboost&endtimestamp=${dummy}&sid=`;
                    } else {
                        this.log.info(`Can not create a timestamp with value: ${state.val}`);
                    }
                    break;
                case "windowopenactiv":
                    dummy = Math.floor(Date.now() / 1000);
                    dummy = this.clients[fritz].open * 60 + dummy;
                    sendstr = `ain=${deviceId}&switchcmd=sethkrwindowopen&endtimestamp=${dummy}&sid=`;
                    this.setAckFlag(id_ack, { val: false });
                    break;
                case "windowopenactiveendtime":
                    state.val = parseInt(state.val.toString());
                    dummy = Math.floor(Date.now() / 1000);
                    if (state.val > 0 && state.val < 1441) {
                        dummy = state.val * 60 + dummy;
                        sendstr = `ain=${deviceId}&switchcmd=sethkrwindowopen&endtimestamp=${dummy}&sid=`;
                    } else {
                        this.log.info(`Can not create a timestamp with value: ${state.val}`);
                    }
                    break;
                case "apply":
                    sendstr = `ain=${deviceId}&switchcmd=applytemplate&sid=`;
                    this.setAckFlag(id_ack, { val: false });
                    break;
                case "active":
                    dummy = state.val ? 1 : 0;
                    sendstr = `ain=${deviceId}&switchcmd=settriggeractive&active=${dummy}&sid=`;
                    this.setAckFlag(id_ack);
                    break;
                default:
                    sendstr = "";
                    break;
            }
            this.log.debug(`command: ${sendstr}`);
            if (sendstr != "") {
                this.clients[fritz].apiFritz.getCommand("GET", sendstr, id_ack, state.val);
                this.setAckFlag(id_ack);
            }
        } catch (e) {
            this.log.error(`Sendcommand: ${e}`);
        }
    }

    async own_request(id, fritz, url) {
        url = `${url}&sid=`;
        const data = await this.clients[fritz].apiFritz.own_request("GET", url, null, true);
        if (data) {
            await this.setState(`${fritz}.DECT_Control.own_request_response`, { val: JSON.stringify(data), ack: true });
        }
        this.setAckFlag(id);
    }

    async createColorTemplates(id_ack, fritz) {
        const all_state = await this.getObjectViewAsync("system", "state", {
            startkey: `${this.namespace}.${fritz}.DECT_Control.addColorTemplate.`,
            endkey: `${this.namespace}.${fritz}.DECT_Control.addColorTemplate.\u9999`,
        });
        let child_count = 1;
        let childs = "";
        for (const dev of all_state.rows) {
            if (dev.value && dev.value.common && dev.value.common.desc === "device") {
                const value = await this.getStateAsync(dev.id);
                if (value && value.val) {
                    const deviceId = dev.id.split(".").pop();
                    const ident = await this.getStateAsync(`${fritz}.${deviceId}.identifier`);
                    if (ident && ident.val != null) {
                        const ident_id = ident.val.toString().replace(/-1/g, "");
                        childs += `&child_${child_count}=${encodeURIComponent(ident_id)}`;
                        ++child_count;
                    }
                }
            }
        }
        if (child_count === 1) {
            this.log.warn(`Missing childs`);
            return;
        }
        let path = "switchcmd=addcolorleveltemplate";
        let value = await this.getStateAsync(`${fritz}.DECT_Control.addColorTemplate.name_template`);
        if (value && value.val != null) {
            path += `&name=${value.val}`;
        } else {
            this.log.warn(`Missing name`);
            return;
        }
        value = await this.getStateAsync(`${fritz}.DECT_Control.addColorTemplate.hue_template`);
        if (value && value.val != null) {
            path += `&hue=${value.val}`;
        } else {
            this.log.warn(`Missing hue`);
            return;
        }
        value = await this.getStateAsync(`${fritz}.DECT_Control.addColorTemplate.saturation_template`);
        if (value && value.val != null) {
            path += `&saturation=${value.val}`;
        } else {
            this.log.warn(`Missing saturation`);
            return;
        }
        value = await this.getStateAsync(`${fritz}.DECT_Control.addColorTemplate.levelPercentage_template`);
        if (value && value.val != null) {
            path += `&levelPercentage=${value.val}`;
        } else {
            this.log.warn(`Missing levelPercentage`);
            return;
        }
        value = await this.getStateAsync(`${fritz}.DECT_Control.addColorTemplate.colorpreset`);
        if (value && value.val != null) {
            path += `&colorpreset=${value.val}`;
        } else {
            this.log.warn(`Missing colorpreset`);
            return;
        }
        path += childs;
        path += "&sid=";
        this.log.debug(`Path: ${path}`);
        this.clients[fritz].apiFritz.getCommand("GET", path, id_ack, true);
        this.setAckFlag(id_ack, { val: false });
    }

    async createTemperatureTemplates(id_ack, fritz) {
        const all_state = await this.getObjectViewAsync("system", "state", {
            startkey: `${this.namespace}.${fritz}.DECT_Control.addColorTemplate.`,
            endkey: `${this.namespace}.${fritz}.DECT_Control.addColorTemplate.\u9999`,
        });
        let child_count = 1;
        let childs = "";
        for (const dev of all_state.rows) {
            if (dev.value && dev.value.common && dev.value.common.desc === "device") {
                const value = await this.getStateAsync(dev.id);
                if (value && value.val) {
                    const deviceId = dev.id.split(".").pop();
                    const ident = await this.getStateAsync(`${fritz}.${deviceId}.identifier`);
                    if (ident && ident.val != null) {
                        const ident_id = ident.val.toString().replace(/-1/g, "");
                        childs += `&child_${child_count}=${encodeURIComponent(ident_id)}`;
                        ++child_count;
                    }
                }
            }
        }
        if (child_count === 1) {
            this.log.warn(`Missing childs`);
            return;
        }
        let path = "switchcmd=addcolorleveltemplate";
        let value = await this.getStateAsync(`${fritz}.DECT_Control.addColorTemplate.name_template`);
        if (value && value.val != null) {
            path += `&name=${value.val}`;
        } else {
            this.log.warn(`Missing name`);
            return;
        }
        value = await this.getStateAsync(`${fritz}.DECT_Control.addColorTemplate.colorTemperature_template`);
        if (value && value.val != null) {
            path += `&temperature=${value.val}`;
        } else {
            this.log.warn(`Missing temperature`);
            return;
        }
        value = await this.getStateAsync(`${fritz}.DECT_Control.addColorTemplate.colorpreset`);
        if (value && value.val != null) {
            path += `&colorpreset=${value.val}`;
        } else {
            this.log.warn(`Missing colorpreset`);
            return;
        }
        path += childs;
        path += "&sid=";
        this.log.debug(`Path: ${path}`);
        this.clients[fritz].apiFritz.getCommand("GET", path, id_ack, true);
        this.setAckFlag(id_ack, { val: false });
    }

    async setStateHex(dummy, device) {
        const s = Math.round((dummy[1] / 255) * 100);
        const v = Math.round((dummy[2] / 255) * 100);
        const hex = this.hsvToHex(dummy[0], s, v);
        await this.setState(device, { val: hex, ack: true });
    }

    color_temperature(val) {
        const pct = val;
        let temperature = 3400;
        if (pct >= 0 && pct <= 11) {
            temperature = 2700;
        }
        if (pct >= 11 && pct <= 22) {
            temperature = 3000;
        }
        if (pct >= 22 && pct <= 33) {
            temperature = 3400;
        }
        if (pct >= 33 && pct <= 44) {
            temperature = 3800;
        }
        if (pct >= 44 && pct <= 55) {
            temperature = 4200;
        }
        if (pct >= 55 && pct <= 66) {
            temperature = 4700;
        }
        if (pct >= 66 && pct <= 77) {
            temperature = 5300;
        }
        if (pct >= 77 && pct <= 88) {
            temperature = 5900;
        }
        if (pct >= 88 && pct <= 100) {
            temperature = 6500;
        }
        return temperature;
    }

    color_500(sat, hue) {
        if (sat >= 25) {
            let val = 255;
            if (hue >= 0 && hue <= 16.5 && sat >= 146) {
                hue = 358;
                sat = 180;
                val = 255;
            } else if (hue >= 0 && hue <= 16.5 && sat >= 83) {
                hue = 358;
                sat = 112;
                val = 205;
            } else if (hue >= 0 && hue <= 16.5 && sat >= 0) {
                hue = 358;
                sat = 54;
                val = 155;
            } else if (hue >= 16.5 && hue <= 43.5 && sat >= 177) {
                hue = 35;
                sat = 214;
                val = 255;
            } else if (hue >= 16.5 && hue <= 43.5 && sat >= 106) {
                hue = 35;
                sat = 140;
                val = 252;
            } else if (hue >= 16.5 && hue <= 43.5 && sat >= 0) {
                hue = 35;
                sat = 72;
                val = 225;
            } else if (hue >= 43.5 && hue <= 72 && sat >= 127.5) {
                hue = 52;
                sat = 153;
                val = 255;
            } else if (hue >= 43.5 && hue <= 72 && sat >= 76.5) {
                hue = 52;
                sat = 102;
                val = 225;
            } else if (hue >= 43.5 && hue <= 72 && sat >= 0) {
                hue = 52;
                sat = 51;
                val = 205;
            } else if (hue >= 72 && hue <= 106 && sat >= 101) {
                hue = 92;
                sat = 123;
                val = 255;
            } else if (hue >= 72 && hue <= 106 && sat >= 58.5) {
                hue = 92;
                sat = 79;
                val = 225;
            } else if (hue >= 72 && hue <= 106 && sat >= 0) {
                hue = 92;
                sat = 38;
                val = 205;
            } else if (hue >= 106 && hue <= 140 && sat >= 121) {
                hue = 120;
                sat = 160;
                val = 255;
            } else if (hue >= 106 && hue <= 140 && sat >= 60) {
                hue = 120;
                sat = 82;
                val = 205;
            } else if (hue >= 106 && hue <= 140 && sat >= 0) {
                hue = 120;
                sat = 38;
                val = 155;
            } else if (hue >= 140 && hue <= 177.5 && sat >= 114.5) {
                hue = 160;
                sat = 145;
                val = 255;
            } else if (hue >= 140 && hue <= 177.5 && sat >= 62.5) {
                hue = 160;
                sat = 84;
                val = 205;
            } else if (hue >= 140 && hue <= 177.5 && sat >= 0) {
                hue = 160;
                sat = 41;
                val = 155;
            } else if (hue >= 177.5 && hue <= 203.5 && sat >= 148.5) {
                hue = 195;
                sat = 179;
                val = 255;
            } else if (hue >= 177.5 && hue <= 203.5 && sat >= 88.5) {
                hue = 195;
                sat = 118;
                val = 205;
            } else if (hue >= 177.5 && hue <= 203.5 && sat >= 0) {
                hue = 195;
                sat = 59;
                val = 155;
            } else if (hue >= 203.5 && hue <= 218.5 && sat >= 146) {
                hue = 212;
                sat = 169;
                val = 255;
            } else if (hue >= 203.5 && hue <= 218.5 && sat >= 83) {
                hue = 212;
                sat = 110;
                val = 205;
            } else if (hue >= 0 && hue <= 218.5 && sat >= 0) {
                hue = 212;
                sat = 56;
                val = 155;
            } else if (hue >= 0 && hue <= 245.5 && sat >= 146) {
                hue = 225;
                sat = 204;
                val = 255;
            } else if (hue >= 0 && hue <= 245.5 && sat >= 83) {
                hue = 225;
                sat = 135;
                val = 205;
            } else if (hue >= 218.5 && hue <= 245.5 && sat >= 0) {
                hue = 225;
                sat = 67;
                val = 155;
            } else if (hue >= 245.5 && hue <= 281 && sat >= 146) {
                hue = 266;
                sat = 169;
                val = 255;
            } else if (hue >= 245.5 && hue <= 281 && sat >= 83) {
                hue = 266;
                sat = 110;
                val = 205;
            } else if (hue >= 245.5 && hue <= 281 && sat >= 0) {
                hue = 266;
                sat = 54;
                val = 155;
            } else if (hue >= 281 && hue <= 315.5 && sat >= 146) {
                hue = 296;
                sat = 140;
                val = 255;
            } else if (hue >= 281 && hue <= 315.5 && sat >= 83) {
                hue = 296;
                sat = 92;
                val = 205;
            } else if (hue >= 281 && hue <= 315.5 && sat >= 0) {
                hue = 296;
                sat = 46;
                val = 155;
            } else if (hue >= 315.5 && hue <= 346.5 && sat >= 146) {
                hue = 335;
                sat = 180;
                val = 255;
            } else if (hue >= 315.5 && hue <= 346.5 && sat >= 83) {
                hue = 335;
                sat = 107;
                val = 205;
            } else if (hue >= 315.5 && hue <= 346.5 && sat >= 0) {
                hue = 335;
                sat = 51;
                val = 155;
            } else if (hue >= 346.5 && hue <= 360 && sat >= 146) {
                hue = 358;
                sat = 180;
                val = 255;
            } else if (hue >= 346.5 && hue <= 360 && sat >= 83) {
                hue = 358;
                sat = 112;
                val = 205;
            } else if (hue >= 346.5 && hue <= 360 && sat >= 0) {
                hue = 358;
                sat = 54;
                val = 155;
            }
            return [hue, sat, val];
        }
        return [0, 0, 0];
    }

    hex_to_rgb(hex) {
        hex = hex.replace(/#/g, "");
        const num = parseInt(hex, 16);
        return this.rgb_to_hsv(num >> 16, (num >> 8) & 255, num & 255);
    }

    rgb_to_hsv(r, g, b) {
        const min = Math.min(r, g, b);
        const max = Math.max(r, g, b);
        const delta = max - min;
        let h;
        let s;
        let v = max;
        v = Math.floor((max / 255) * 100);
        this.log.debug(v.toString());
        if (max != 0) {
            s = (delta / max) * 100;
        } else {
            return [0, 0, 0];
        }
        if (r == max) {
            h = (g - b) / delta;
        } else if (g == max) {
            h = 2 + (b - r) / delta;
        } else {
            h = 4 + (r - g) / delta;
        }
        h = Math.floor(h * 60);
        if (h < 0) {
            h += 360;
        }
        return this.color_500(Math.round((s / 100) * 255), h);
    }

    hsvToHex(h, s, v) {
        h = this.bound(h, 360) * 6;
        s = this.bound(s, 100);
        v = this.bound(v, 100);
        const i = Math.floor(h);
        const f = h - i;
        const p = v * (1 - s);
        const q = v * (1 - f * s);
        const t = v * (1 - (1 - f) * s);
        const mod = i % 6;
        const r = [v, q, p, p, t, v][mod];
        const g = [t, v, v, q, p, p][mod];
        const b = [p, p, t, v, v, q][mod];
        return `#${(Math.round(b * 255) | (Math.round(g * 255) << 8) | (Math.round(r * 255) << 16) | (1 << 24))
            .toString(16)
            .slice(1)}`;
    }

    /**
     * @param {number} ms
     */
    sleep(ms) {
        return new Promise(resolve => {
            this.sleepTimer = this.setTimeout(() => {
                resolve;
            }, ms);
        });
    }

    bound(n, max) {
        if (typeof n == "string" && n.indexOf(".") != -1 && parseFloat(n) === 1) {
            n = "100%";
        }
        const is_percent = typeof n === "string" && n.indexOf("%") != -1;
        n = Math.min(max, Math.max(0, parseFloat(n)));
        if (is_percent) {
            n = (n * max) / 100;
            n = parseInt(n, 10);
        }
        if (Math.abs(n - max) < 0.000001) {
            return 1;
        }
        return (n % max) / parseFloat(max);
    }

    /**
     * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
     * Using this method requires "common.messagebox" property to be set to true in io-package.json
     *
     * @param {ioBroker.Message} obj
     */
    onMessage(obj) {
        if (this.double_call[obj._id] != null) {
            return;
        }
        this.double_call[obj._id] = true;
        if (typeof obj === "object" && obj.message) {
            if (obj.command === "getIPList") {
                try {
                    let ip_array = [];
                    const ips = [];
                    if (obj && obj.message && obj.message.fritzip && obj.message.fritzip.fritzips) {
                        ip_array = obj.message.fritzip.fritzips;
                    } else {
                        this.sendTo(obj.from, obj.command, [], obj.callback);
                        delete this.double_call[obj._id];
                        return;
                    }
                    if (ip_array && Object.keys(ip_array).length > 0) {
                        for (const ip of ip_array) {
                            const label = ip.ip;
                            ips.push({ label: label, value: label });
                        }
                        ips.sort((a, b) => (a.label > b.label ? 1 : b.label > a.label ? -1 : 0));
                        this.sendTo(obj.from, obj.command, ips, obj.callback);
                    } else {
                        this.sendTo(obj.from, obj.command, [], obj.callback);
                    }
                } catch {
                    delete this.double_call[obj._id];
                    this.sendTo(obj.from, obj.command, [], obj.callback);
                }
                delete this.double_call[obj._id];
                return;
            } else if (obj.command === "getIconList") {
                try {
                    let icon_array = [];
                    const icons = [];
                    if (obj && obj.message && obj.message.icon && obj.message.icon.icons) {
                        icon_array = obj.message.icon.icons;
                    } else {
                        this.sendTo(obj.from, obj.command, [], obj.callback);
                        delete this.double_call[obj._id];
                        return;
                    }
                    if (icon_array && Object.keys(icon_array).length > 0) {
                        for (const icon of icon_array) {
                            const label = icon.iconname;
                            icons.push({ label: label, value: icon.picture });
                        }
                        icons.sort((a, b) => (a.label > b.label ? 1 : b.label > a.label ? -1 : 0));
                        this.sendTo(obj.from, obj.command, icons, obj.callback);
                    } else {
                        this.sendTo(obj.from, obj.command, [], obj.callback);
                    }
                } catch {
                    delete this.double_call[obj._id];
                    this.sendTo(obj.from, obj.command, [], obj.callback);
                }
                delete this.double_call[obj._id];
                return;
            } else if (obj.command === "getTRRequest") {
                this.log.debug(`onMessage: ${JSON.stringify(obj)}`);
                if (obj.message) {
                    const message = obj.message;
                    if (message.ip && message.ip != "") {
                        const ip = this.forbidden_ip(message.ip);
                        if (this.clients[ip]) {
                            const send = {
                                service: "",
                                action: "",
                                params: {},
                                html: false,
                                tag: "",
                                link: "",
                            };
                            if (
                                message.service &&
                                message.service != "" &&
                                message.service != "" &&
                                message.service != "SERVICE-ID"
                            ) {
                                send.service = message.service;
                                if (
                                    message.action &&
                                    message.action != "" &&
                                    message.action != "" &&
                                    message.action != "Action"
                                ) {
                                    send.action = message.action;
                                    if (message.param_1 && message.param_1 != "") {
                                        send.params[message.param_1] = message.val_1 != "" ? message.val_1 : 0;
                                    }
                                    if (message.param_2 && message.param_2 != "") {
                                        send.params[message.param_2] = message.val_2 != "" ? message.val_2 : 0;
                                    }
                                    if (message.html) {
                                        send.html = message.html;
                                    }
                                    if (message.link && message.link != "") {
                                        send.link = message.link;
                                    }
                                    if (message.tag && message.tag != "") {
                                        send.tag = message.tag;
                                    }
                                    if (message.tag != "" && message.link != "") {
                                        this.sendTo(
                                            obj.from,
                                            obj.command,
                                            [{ error: "Value link & tag is not allowed" }],
                                            obj.callback,
                                        );
                                    } else {
                                        this.clients[ip].tr064.sendCommand(ip, send, obj, null);
                                    }
                                } else {
                                    this.sendTo(obj.from, obj.command, [{ error: "Missing action" }], obj.callback);
                                }
                            } else {
                                this.sendTo(obj.from, obj.command, [{ error: "Missing service" }], obj.callback);
                            }
                        } else {
                            this.sendTo(obj.from, obj.command, [{ error: "Missing client" }], obj.callback);
                        }
                    } else {
                        this.sendTo(obj.from, obj.command, [{ error: "Missing IP" }], obj.callback);
                    }
                } else {
                    this.sendTo(obj.from, obj.command, [{ error: "Missing message" }], obj.callback);
                }
                delete this.double_call[obj._id];
                return;
            } else if (obj.command === "getHTTPRequest") {
                this.log.debug(`onMessage: ${JSON.stringify(obj)}`);
                if (obj.message) {
                    const message = obj.message;
                    if (message.ip && message.ip != "") {
                        const ip = this.forbidden_ip(message.ip);
                        if (this.clients[ip]) {
                            if (message.linkid && message.linkid != "") {
                                this.clients[ip].apiFritz.sendHTTP(ip, message.linkid, obj);
                            } else {
                                this.sendTo(obj.from, obj.command, [{ error: "Missing link-id" }], obj.callback);
                            }
                        } else {
                            this.sendTo(obj.from, obj.command, [{ error: "Missing client" }], obj.callback);
                        }
                    } else {
                        this.sendTo(obj.from, obj.command, [{ error: "Missing IP" }], obj.callback);
                    }
                } else {
                    this.sendTo(obj.from, obj.command, [{ error: "Missing message" }], obj.callback);
                }
                delete this.double_call[obj._id];
                return;
            }
            //this.log.debug("onMessage: " + JSON.stringify(obj));
        }
    }

    getmask(mask) {
        if (mask == 0 || mask == "0") {
            return constants.bitmasks[0];
        }
        const masks = (mask >>> 0).toString(2).split("").reverse().join("");
        let bitstring = null;
        for (let i = 0; i < masks.toString().length; i++) {
            if (masks.toString()[i] === "1") {
                if (bitstring === null) {
                    bitstring = constants.bitmasks[i];
                } else {
                    bitstring += ` - ${constants.bitmasks[i]}`;
                }
            }
        }
        return bitstring;
    }

    getinterfaces(valtf) {
        if (valtf == null) {
            return "Unknwon";
        }
        if (!valtf.toString().includes(",")) {
            return constants.interfaces[valtf];
        }
        let valtfnew = null;
        const valtfarr = valtf.split(",");
        for (let i = 0; i < valtfarr.length; i++) {
            if (valtfnew === null) {
                valtfnew = constants.interfaces[valtfarr[i]];
            } else {
                valtfnew += ` - ${constants.interfaces[valtfarr[i]]}`;
            }
        }
        return valtfnew;
    }

    getIcon(mask, name, dp_name) {
        if (constants.pics[name] != null) {
            return constants.pics[name];
        }
        const masks = (mask >>> 0).toString(2).split("").reverse().join("");
        const pic = typeof name != "undefined" ? name.split(" ").pop() : "NOK";
        if (masks.toString()[12] === "1") {
            return constants.pics["Group"];
        } else if (constants.pics[pic]) {
            return constants.pics[pic];
        } else if (masks.toString()[18] === "1") {
            return constants.pics["Blind"];
        } else if (masks.toString()[17] === "1") {
            return constants.pics[500];
        } else if (masks.toString()[4] === "1") {
            return constants.pics["FUN"];
        } else if (masks.toString()[6] === "1") {
            return constants.pics[302];
        } else if (dp_name === "TRIGGER") {
            return constants.pics["trigger"];
        } else if (dp_name === "TEMPLATE") {
            return constants.pics["templates"];
        }
        return constants.pics["Unbekannt"];
    }

    /**
     * @param {string} id
     * @param {object} [value=null]
     */
    async setAckFlag(id, value) {
        try {
            if (id) {
                await this.setState(id, {
                    ack: true,
                    ...value,
                });
            }
        } catch (e) {
            this.log.error(`setAckFlag: ${e}`);
        }
    }
}

if (require.main !== module) {
    // Export the constructor in compact mode
    /**
     * @param {Partial<utils.AdapterOptions>} [options={}]
     */
    module.exports = options => new Fritzboxdect(options);
} else {
    // otherwise start the instance directly
    new Fritzboxdect();
}
