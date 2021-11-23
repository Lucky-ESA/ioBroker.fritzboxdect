//v1.0
const JSONbig = require("json-bigint")({ storeAsString: true });
const entries = require("./entries");

module.exports = class updateDP {
    constructor(adapter) {
        this.adapter = adapter;
    }

    async parse(isblind, lastelement, path, element) {
        try {
            if (element === null || element === undefined) {
                this.adapter.log.debug("Cannot extract empty: " + path);
                return;
            }
            const objectKeys = Object.keys(element);

            let tf     = null;
            let st     = null;
            let valtf  = null;
            let common = {};
            const temp = ['absenk', 'tsoll', 'tist', 'tchange', 'komfort', 'offset'];
            objectKeys.forEach(async (key) => {
                if (this.isJsonString(element[key])) {
                    element[key] = JSONbig.parse(element[key]);
                }
                if (this.isJsonString(lastelement[key])) {
                    lastelement[key] = JSONbig.parse(lastelement[key]);
                }
                if (element[key] !== null && typeof element[key] === "object") {
                    this.parse(isblind, lastelement[key], path + "." + key, element[key]);
                } else {
                    if (element[key] !== lastelement[key]) {
                        st = path.split(".")[1];
                        if (key === "levelpercentage" && isblind === 1) {
                            valtf = 100 - element[key];
                            this.adapter.setState(path + ".levelalexa", valtf, true);
                            tf = "";
                            valtf = "";
                        }
                        tf = this.getRole(key, "typ", st, isblind);
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
                                    name: "Target Temperature",
                                    role: "level.temperature",
                                    type: "mixed",
                                    write: true,
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
                    }
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

    getRole(element, arr, st, blind) {
        if (st === "alert" && element === "state") element = "states";
        if (st === "alert" && element === "states" && blind === 1) element = "blindstate";
        if (st === "simpleonoff" && element === "state") element = "simple";

        const commons = entries.commons

        const valarr = commons[element.toLowerCase()];

        if (typeof valarr != 'undefined') {
            return valarr[arr];
        }
        return "state";
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
