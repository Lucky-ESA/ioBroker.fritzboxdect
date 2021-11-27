//v1.0
/*
options:
write
forceIndex
channelName
preferedArrayName
*/
const JSONbig = require("json-bigint")({ storeAsString: true });
module.exports = class getlist {
    constructor(adapter) {
        this.adapter = adapter;
        this.alreadyCreatedOBjects = {};
    }

    async parse(path, element, options) {
        try {
            if (element === null || element === undefined) {
                this.adapter.log.debug("Cannot extract empty: " + path);
                return;
            }

            const objectKeys = Object.keys(element);

            if (!options || !options.write) {
                if (!options) {
                    options = { write: false };
                } else {
                    options["write"] = false;
                }
            }

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
            objectKeys.forEach(async (key) => {
                if (this.isJsonString(element[key])) {
                    element[key] = JSONbig.parse(element[key]);
                }
                if (!this.alreadyCreatedOBjects[path + "." + key]) {
                    await this.adapter
                        .setObjectNotExistsAsync(path + "." + key, {
                            type: "state",
                            common: {
                                name: key,
                                role: this.getRole(element[key], options.write),
                                type: element[key] !== null ? typeof element[key] : "mixed",
                                write: options.write,
                                read: true,
                            },
                            native: {},
                        })
                        .then(() => {
                            this.alreadyCreatedOBjects[path + "." + key] = true;
                        })
                        .catch((error) => {
                            this.adapter.log.error(error);
                        });
                }
                this.adapter.setState(path + "." + key, element[key], true);
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
    getRole(element, write) {
        if (typeof element === "boolean" && !write) {
            return "indicator";
        }
        if (typeof element === "boolean" && write) {
            return "switch";
        }
        if (typeof element === "number" && !write) {
            return "value";
        }
        if (typeof element === "number" && write) {
            return "level";
        }
        if (typeof element === "string") {
            return "text";
        }
        return "state";
    }
};
