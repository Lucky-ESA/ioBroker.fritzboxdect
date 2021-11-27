//v1.0
/*
options:
write
forceIndex
channelName
preferedArrayName
*/
const JSONbig = require("json-bigint")({ storeAsString: true });
const entries = require("./entries");

module.exports = class createDP {
    constructor(adapter) {
        this.adapter = adapter;
        this.alreadyCreatedOBjects = {};
    }

    async parse(isblind, elements, path, element, options) {
        try {
            if (element === null || element === undefined) {
                this.adapter.log.debug("Cannot extract empty: " + path);
                return;
            }
            const objectKeys = Object.keys(element);
            let lastsplit = null;
            let tf = null;
            let st = null;
            let valtf = null;
            let states = {};
            let common = {};
            const temp = ['absenk', 'tsoll', 'tist', 'tchange', 'komfort', 'offset'];
            const proz = ['battery', 'levelpercentage', 'humidity', 'rel_humidity'];
            const grad = ['hue', 'saturation', 'unmapped_hue'];
            if (!options || !options.write) {
                if (!options) {
                    options = { write: false };
                } else {
                    options["write"] = false;
                }
            }
            lastsplit = path.split('.')[path.split('.').length-1];
            st = path.split(".")[1];
            options.channelName = (lastsplit.includes('DECT_')) ? elements.name : lastsplit
            if (lastsplit === "0" || lastsplit === "1" || lastsplit === "2" || lastsplit === "3")
                options.channelName = (elements.button[lastsplit].name) ? elements.button[lastsplit].name : lastsplit;
            if (!this.alreadyCreatedOBjects[path]) {
                await this.adapter
                    .setObjectNotExistsAsync(path, {
                        type: "channel",
                        common: {
                            name: options.channelName || "",
                            write: false,
                            read: true,
                        },
                        native: {},
                    })
                    .then(() => {
                        this.alreadyCreatedOBjects[path] = true;
                    })
                    .catch((error) => {
                        this.adapter.log.error(error);
                    });
            }
            if (lastsplit === "powermeter") {
                if (!this.alreadyCreatedOBjects[path + ".loadpowerstatic"]) {
                    await this.adapter
                        .setObjectNotExistsAsync(path + ".loadpowerstatic", {
                            type: "state",
                            common: {
                                name: "Load power statistics",
                                role: "button",
                                type: "boolean",
                                write: true,
                                read: true
                            },
                            native: {},
                            })
                        .then(() => {
                            this.alreadyCreatedOBjects[path + ".loadpowerstatic"] = true;
                        })
                        .catch((error) => {
                            this.adapter.log.error(error);
                        });
                }
            }
            if (lastsplit === "temperature") {
                if (!this.alreadyCreatedOBjects[path + ".loadtempstatic"]) {
                    await this.adapter
                        .setObjectNotExistsAsync(path + ".loadtempstatic", {
                            type: "state",
                            common: {
                                name: "Load temperature statistics",
                                role: "button",
                                type: "boolean",
                                write: true,
                                read: true
                            },
                            native: {},
                            })
                        .then(() => {
                            this.alreadyCreatedOBjects[path + ".loadtempstatic"] = true;
                        })
                        .catch((error) => {
                            this.adapter.log.error(error);
                        });
                }
            }
            if (lastsplit === "colorcontrol") {
                if (!this.alreadyCreatedOBjects[path + ".loadcolor"]) {
                    await this.adapter
                        .setObjectNotExistsAsync(path + ".loadcolor", {
                            type: "state",
                            common: {
                                name: "Load color template",
                                role: "button",
                                type: "boolean",
                                write: true,
                                read: true
                            },
                            native: {},
                            })
                        .then(() => {
                            this.alreadyCreatedOBjects[path + ".loadcolor"] = true;
                        })
                        .catch((error) => {
                            this.adapter.log.error(error);
                        });
                }
            }
            if (lastsplit === "levelcontrol" && isblind === 1) {
                if (!this.alreadyCreatedOBjects[path + ".levelstring"]) {
                    await this.adapter
                        .setObjectNotExistsAsync(path + ".levelstring", {
                            type: "state",
                            common: {
                                name: "0=close 1=open 2=stop",
                                role: "value",
                                type: "number",
                                write: true,
                                read: true,
                                min: 0,
                                max: 2,
                                def: 0,
                                states: {
                                    "0": "close",
                                    "1": "open",
                                    "2": "stop"
                                }
                            },
                            native: {},
                            })
                        .then(() => {
                            this.alreadyCreatedOBjects[path + ".levelstring"] = true;
                        })
                        .catch((error) => {
                            this.adapter.log.error(error);
                        });
                }
                if (!this.alreadyCreatedOBjects[path + ".levelalexa"]) {
                    await this.adapter
                        .setObjectNotExistsAsync(path + ".levelalexa", {
                            type: "state",
                            common: {
                                name: "0=close 100=open",
                                role: "value",
                                type: "number",
                                write: true,
                                read: true,
                                min: 0,
                                max: 100,
                                def: 0,
                                unit: "%"
                            },
                            native: {},
                        })
                        .then(() => {
                            this.alreadyCreatedOBjects[path + ".levelalexa"] = true;
                        })
                        .catch((error) => {
                            this.adapter.log.error(error);
                        });
                }
            }
            objectKeys.forEach(async (key) => {
                if (this.isJsonString(element[key])) {
                    element[key] = JSONbig.parse(element[key]);
                }
                if (element[key] !== null && typeof element[key] === "object") {
                    this.parse(isblind, elements, path + "." + key, element[key], options);
                } else {
                    st = path.split(".")[1];
                    common = {
                        name: this.getRole(key, options.write, "name", st, isblind),
                        role: this.getRole(key, options.write, "role", st, isblind),
                        type: element[key] !== null ? this.getRole(key, options.write, "typ", st, isblind)  : "mixed",
                        write: this.getRole(key, options.write, "write", st, isblind),
                        read: true,
                    }
                    if (temp.includes(key) || key === "celsius") {
                        common.min = "-30";
                        common.max = 255;
                        common.unit = "°C";
                    }
                    if (grad.includes(key)) {
                        common.min = 0;
                        common.max = 359;
                        common.unit = "°";
                    }
                    if (proz.includes(key)) {
                        if (lastsplit === 'humidity' || lastsplit === 'rel_humidity') {
                            common.min = "-9999";
                        } else {
                            common.min = 0;
                        }
                        common.max = 100;
                        common.unit = "%";
                    }
                    if (key === "level") {
                        common.min = 0;
                        common.max = 255;
                    }
                    if (st === "simpleonoff") {
                        common.min = 0;
                        common.max = 2;
                        common.def = 0;
                    }
                    if (key === "temperature") {
                        common.min = 0;
                        common.max = 9000;
                        common.unit = "K";
                    }
                    if (key === "voltage") common.unit = "V";
                    if (key === "energy") common.unit = "Wh";
                    if (key === "power") common.unit = "W";
                    lastsplit = path.split('.')[path.split('.').length-1];
                    states = this.addstate(key, st, isblind);
                    if (typeof states != 'undefined') {
                        common.states = states;
                    }
                    if (!this.alreadyCreatedOBjects[path + "." + key]) {
                        await this.adapter
                            .setObjectNotExistsAsync(path + "." + key, {
                                type: "state",
                                common: common,
                                native: {},
                            })
                            .then(() => {
                                this.alreadyCreatedOBjects[path + "." + key] = true;
                            })
                            .catch((error) => {
                                this.adapter.log.error(error);
                            });
                    }
                    if (lastsplit === "colorcontrol") {
                        if (!this.alreadyCreatedOBjects[path + ".huealexa"]) {
                            await this.adapter
                                .setObjectNotExistsAsync(path + ".huealexa", {
                                    type: "state",
                                    common: {
                                        name: "RGB Color from IOT Alexa",
                                        role: "level.color.rgb",
                                        type: "string",
                                        write: true,
                                        read: true
                                    },
                                    native: {},
                                })
                                .then(() => {
                                    this.alreadyCreatedOBjects[path + ".huealexa"] = true;
                                })
                                .catch((error) => {
                                    this.adapter.log.error(error);
                                });
                        }
                    }
                    if (key === "levelpercentage" && isblind === 1) {
                        if (!this.alreadyCreatedOBjects[path + ".levelstring"]) {
                            await this.adapter
                                .setObjectNotExistsAsync(path + ".levelstring", {
                                    type: "state",
                                    common: {
                                        name: "0=close 1=open 2=stop",
                                        role: "value",
                                        type: "number",
                                        write: true,
                                        read: true,
                                        min: 0,
                                        max: 2,
                                        def: 0,
                                        states: {
                                            "0": "close",
                                            "1": "open",
                                            "2": "stop"
                                        }
                                    },
                                    native: {},
                                })
                                .then(() => {
                                    this.alreadyCreatedOBjects[path + ".levelstring"] = true;
                                })
                                .catch((error) => {
                                    this.adapter.log.error(error);
                                });
                        }
                        if (!this.alreadyCreatedOBjects[path + ".levelalexa"]) {
                            await this.adapter
                                .setObjectNotExistsAsync(path + ".levelalexa", {
                                    type: "state",
                                    common: {
                                        name: "0=open 100=close",
                                        role: "value",
                                        type: "number",
                                        write: true,
                                        read: true,
                                        min: 0,
                                        max: 100,
                                        def: 0,
                                        unit: "%"
                                    },
                                    native: {},
                                })
                                .then(() => {
                                    this.alreadyCreatedOBjects[path + ".levelalexa"] = true;
                                    valtf = 100 - element[key];
                                    this.adapter.setState(path + ".levelalexa", valtf, true);
                                })
                                .catch((error) => {
                                    this.adapter.log.error(error);
                                });
                        } else {
                            valtf = 100 - element[key];
                            this.adapter.setState(path + ".levelalexa", valtf, true);
                        }
                    }
                    tf = this.getRole(key, options.write, "typ", st, isblind);
                    if (tf === "boolean") {
                        valtf = (element[key] === 0) ? false : true;
                    } else if (tf === "number" && !element[key]) {
                        valtf = 0;
                    } else {
                        valtf = element[key];
                    }
                    valtf = (key === "celsius" && valtf.toString().length > 2) ? valtf / 10 : valtf;
                    valtf = (temp.includes(key)) ? valtf / 2 : valtf;
                    if (key === "voltage" && valtf > 0) valtf = valtf * 0.001;
                    if (key === "power" && valtf > 0) valtf = valtf * 0.01;
                    if (key === "tsoll") {
                        let units = null;
                        if (valtf === 126.5) {
                            units = "";
                            valtf = "Off";
                        } else if (valtf === 127) {
                            units = "";
                            valtf = "On";
                        } else {
                            units = "°C";
                        }
                        const obj = {
                            "type": "state",
                            "common": {
                                name: this.getRole(key, options.write, "name", st, isblind),
                                role: this.getRole(key, options.write, "role", st, isblind),
                                type: element[key] !== null ? this.getRole(key, options.write, "typ", st, isblind)  : "mixed",
                                write: this.getRole(key, options.write, "write", st, isblind),
                                read: true,
                                min: "-30",
                                max: 255,
                                unit: units
                                },
                                native: {}
                            };
                        this.adapter.setObject(path + "." + key, obj);
                    }
                    if (key === "functionbitmask") valtf += " - " + this.getmask(element[key]);
                    if (key === "interfaces") valtf = this.getinterfaces(valtf);
                    this.adapter.setState(path + "." + key, valtf, true);
                    tf = "";
                    valtf = "";
                }
            });
        } catch (error) {
            this.adapter.log.error("Error extract keys: " + path + " " + JSON.stringify(element));
            this.adapter.log.error(error);
        }
    }

    isJsonString(str) {
        try {
            JSON.parse(str);
        } catch (e) {
            return false;
        }
        return true;
    }

    addstate(element, st, blind) {
        if (st === "simpleonoff") element = "simple";
        if (st === "alert" && element === "state" && blind === 1) element = "blindstate";
        const commons = { 
            present: {"true": "1", "false": "0"}, 
            txbusy: {"true": "1", "false": "0"}, 
            batterylow: {"true": "1", "false": "0"},  
            lock: {"true": "1", "false": "0"}, 
            devicelock: {"true": "1", "false": "0"}, 
            windowopenactiv: {"true": "1", "false" : "0"}, 
            boostactive: {"true": "1", "false": "0"},  
            summeractive: {"true": "1", "false": "0"}, 
            holidayactive: {"true": "1", "false": "0"}, 
            state: {"true": "1", "false": "0"}, 
            blindstate: {"0": "Kein Fehler", "1": "Hindernisalarm", "2": "Überhitzungsalarm"}, 
            mode: {name: "Mode", typ : "string", role : "info"},  
            unittype: {"273": "SIMPLE_BUTTON", "256": "SIMPLE_ON_OFF_SWITCHABLE", "257": "SIMPLE_ON_OFF_SWITCH", "262": "AC_OUTLET", "263": "AC_OUTLET_SIMPLE_POWER_METERING", "264": "SIMPLE_LIGHT", "265": "DIMMABLE_LIGHT", "266": "DIMMER_SWITCH", "277": "COLOR_BULB", "278": "DIMMABLE_COLOR_BULB", "281": "BLIND", "282": "LAMELLAR", "512": "SIMPLE_DETECTOR", "513": "DOOR_OPEN_CLOSE_DETECTOR", "514": "WINDOW_OPEN_CLOSE_DETECTOR", "515": "MOTION_DETECTOR", "518": "FLOOD_DETECTOR", "519": "GLAS_BREAK_DETECTOR", "520": "VIBRATION_DETECTOR", "640": "SIREN"}, 
            fullcolorsupport: {"true": "1", "false": "0"}, 
            mapped: {"true": "1", "false": "0"},
            current_mode: {"1": "Color", "4": "Light", "": "Unknown"},
            mode: {"manuell": "manuell", "auto": "auto", "": "Error"},
            errorcode: {"0": "No Error", "1": "No adaptation possible", "2": "Battery power too weak", "3": "No valve movement possible", "4": "Installation ongoing", "5": "Installation mode", "6": "Adaptation of the heating valve"},
            lock: {"0": "Off", "1": "On", "": "Error"},
            devicelock: {"0": "Off", "1": "On", "": "Error"},
            simple: {"0": "off", "1": "on", "2": "toggle"},
            temperature: {"0": "Keine Licht", "2700": "Warmweiß_1", "3000": "Warmweiß_2", "3400": "Warmweiß_3", "3800": "Neutral_1", "4200": "Neutral_2", "4700": "Neutral_3", "5300": "Tageslicht_1", "5900": "Tageslicht_1", "6500": "Tageslicht_1"},
            hue: {"0": "Keine Farbe", "358": "Rot", "35": "Orange", "52": "Gelb", "92": "Grasgrün", "120": "Grün", "160": "Türkis", "195": "Cyan", "212": "Himmelblau", "225": "Blau", "266": "Violett", "296": "Magenta", "335": "Pink"}, 
            saturation: {"0": "Keine Farbe", "180": "Rot/Pink", "112": "Rot hell", "54": "Rot heller/Violett heller", "214": "Orange","140": "Orange hell/Magenta",
                "72": "Orange heller", "153": "Gelb", "102": "Gelb hell", "51": "Gelb heller/Pink heller", "123": "Grasgrün", "79": "Grasgrün hell", 
                "38": "Grasgrün heller", "160": "Grün", "82": "Grün hell", "38": "Grün heller", "145": "Türkis", "84": "Türkis hell", 
                "41": "Türkis heller", "179": "Cyan", "118": "Cyan hell", "59": "Cyan heller", "169": "Himmelblau/Violett", "110": "Himmelblau hell/Violett hell", 
                "56": "Himmelblau heller", "204": "Blau", "135": "Blau hell", "67": "Blau heller","Magenta": "Magenta hell", "46": "Magenta heller","107": " hell"}
        }

        const valarr = commons[element.toLowerCase()];

        if (typeof valarr != 'undefined') {
            return valarr;
        }
        return;
    }

    getRole(element, write, arr, st, blind) {
        if (st === "alert" && element === "state") element = "states";
        if (st === "alert" && element === "states" && blind === 1) element = "blindstate";
        if (st === "simpleonoff" && element === "state") element = "simple";
        const commons = entries.commons

        const valarr = commons[element.toLowerCase()];

        if (typeof valarr != 'undefined') {
            return valarr[arr];
        }
        if (arr === "write") {
            return write;
        }
        if (typeof element === "boolean" && !write && arr === "typ") {
            return "indicator";
        }
        if (typeof element === "boolean" && write && arr === "typ") {
            return "switch";
        }
        if (typeof element === "number" && !write && arr === "typ") {
            return "value";
        }
        if (typeof element === "number" && write && arr === "typ") {
            return "level";
        }
        if (typeof element === "string" && arr === "typ") {
            return "text";
        }
        if (arr === "typ") {
            return "state";
        }
    }

    getmask(mask) {
        const masks = (mask >>> 0).toString(2).split("").reverse().join("");
        let bitstring = null;
        for (let i = 0; i < masks.toString().length; i++) {
            if (masks.toString()[i] === "1") {
                if (bitstring === null) {
                    bitstring = entries.bitmasks["Bit" + i];
                } else {
                    bitstring += ' - ' + entries.bitmasks["Bit" + i];
                }
            }
        }
        return bitstring;
    }

    getinterfaces(valtf) {
        if (!valtf.toString().includes(',')) {
           return entries.interfaces["I" + valtf];
        }
        let valtfnew = null;
        const valtfarr = valtf.split(",");
        for (let i = 0; i < valtfarr.length; i++) {
           if (valtfnew === null) valtfnew = entries.interfaces["I" + valtfarr[i]];
           else  valtfnew += " - " + entries.interfaces["I" + valtfarr[i]];
        }
        return valtfnew;
    }
};
