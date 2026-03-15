const EventEmitter = require("events");
const util = require("util");
const exec = util.promisify(require("child_process").exec);
const xml2js = require("xml2js");

class MACMonitor extends EventEmitter {
    constructor(config, adapter) {
        super();
        this.adapter = adapter;
        this.config = config;
        this.checkinterval = null;
        this.baseURL = `${config.protocol}://${config.ip}:49000`;
        this.parser = new xml2js.Parser({
            explicitArray: false,
            mergeAttrs: true,
            normalizeTags: true,
            ignoreAttrs: true,
        });
        this.all_mac = [];
        this.checkvalue = {};
        this.checkmac = {};
    }

    async start() {
        const regexp = /^(([A-Fa-f0-9]{2}[:]){5}[A-Fa-f0-9]{2}[,]?)+$/i;
        let first = true;
        if (this.config.mac && Array.isArray(this.config.mac)) {
            for (const mac of this.config.mac) {
                if (this.config.ip === mac.ip && mac.active && regexp.test(mac.mac)) {
                    if (!this.checkmac[mac.mac]) {
                        this.checkmac[mac.mac] = true;
                    } else {
                        this.adapter.log.warn(`${this.config.ip} - Found double mac address ${mac.mac}`);
                        continue;
                    }
                    const mac_add = {
                        ip: mac.ip,
                        mac: mac.mac,
                        mac_object: mac.mac.toString().replace(/:/g, "_").toUpperCase(),
                        name: mac.mac_name,
                        online_time: 0,
                        online_utc: "",
                        online_minutes: 0,
                        online_text: "",
                        offline_time: 0,
                        offline_utc: "",
                        offline_time_temp: 0,
                        offline_minutes: 0,
                        offline_text: "",
                        active: mac.active,
                        off_time: mac.off_time * 60 * 1000,
                        last_check: 0,
                        name_fritz: "",
                        ip_fritz: "",
                        interface_fritz: "",
                        source_fritz: "",
                        remaining_fritz: 0,
                        active_fritz: 0,
                        active_fritz_text: "",
                        active_fritz_time: "",
                    };
                    const mac_check = await this.requests(
                        "/upnp/control/hosts",
                        "urn:dslforum-org:service:Hosts:1",
                        "GetSpecificHostEntry",
                        `<NewMACAddress>${mac.mac}</NewMACAddress>`,
                    );
                    if (mac_check != null && typeof mac_check === "string" && mac_check.indexOf("NewIPAddress") != -1) {
                        if (mac_check.indexOf("NewIPAddress") != -1) {
                            const address = mac_check.match("<NewIPAddress>(.*?)</NewIPAddress>");
                            if (address != null && address[1] != null) {
                                mac_add.ip_fritz = typeof address[1] === "string" ? address[1] : "";
                            }
                        }
                        if (mac_check.indexOf("NewAddressSource") != -1) {
                            const addsource = mac_check.match("<NewAddressSource>(.*?)</NewAddressSource>");
                            if (addsource != null && addsource[1] != null) {
                                mac_add.source_fritz = typeof addsource[1] === "string" ? addsource[1] : "";
                            }
                        }
                        if (mac_check.indexOf("NewLeaseTimeRemaining") != -1) {
                            const remaining = mac_check.match("<NewLeaseTimeRemaining>(.*?)</NewLeaseTimeRemaining>");
                            if (remaining != null && remaining[1] != null) {
                                mac_add.remaining_fritz = typeof remaining[1] === "string" ? parseInt(remaining[1]) : 0;
                            }
                        }
                        if (mac_check.indexOf("NewActive") != -1) {
                            const active_fritz = mac_check.match("<NewActive>(.*?)</NewActive>");
                            if (active_fritz != null && active_fritz[1] != null) {
                                mac_add.active_fritz =
                                    typeof active_fritz[1] === "string" ? parseInt(active_fritz[1]) : 0;
                                if (mac_add.active_fritz) {
                                    mac_add.active_fritz_text = "✅ anwesend";
                                } else {
                                    mac_add.active_fritz_text = "❗️ abwesend";
                                }
                                const last_off = await this.adapter.getStateAsync(
                                    `${this.config.dp}.TR_064.Presence.${mac_add.mac_object}.lastoffline`,
                                );
                                const last_on = await this.adapter.getStateAsync(
                                    `${this.config.dp}.TR_064.Presence.${mac_add.mac_object}.lastonline`,
                                );
                                if (last_on && last_on.val != null) {
                                    if (last_on.val === 0) {
                                        if (mac_add.active_fritz) {
                                            mac_add.online_time = Date.now();
                                            mac_add.online_utc = this.adapter.formatDate(
                                                new Date(),
                                                "TT.MM.JJJJ hh:mm:ss",
                                            );
                                        }
                                    } else {
                                        mac_add.online_time = last_on.val;
                                        const diff_on = Date.now() - last_on.val;
                                        mac_add.online_text = mac_add.active_fritz
                                            ? this.timediff(diff_on)
                                            : "0 minutes";
                                        mac_add.active_fritz_time = mac_add.online_text;
                                        mac_add.online_utc = this.adapter.formatDate(
                                            last_on.val,
                                            "TT.MM.JJJJ hh:mm:ss",
                                        );
                                    }
                                } else {
                                    if (mac_add.active_fritz) {
                                        mac_add.online_time = Date.now();
                                        mac_add.online_utc = this.adapter.formatDate(new Date(), "TT.MM.JJJJ hh:mm:ss");
                                    } else {
                                        mac_add.offline_time = Date.now();
                                        mac_add.offline_utc = this.adapter.formatDate(
                                            new Date(),
                                            "TT.MM.JJJJ hh:mm:ss",
                                        );
                                    }
                                }
                                if (last_off && last_off.val != null) {
                                    if (last_off.val === 0) {
                                        if (!mac_add.active_fritz) {
                                            mac_add.offline_time = Date.now();
                                            mac_add.offline_utc = this.adapter.formatDate(
                                                new Date(),
                                                "TT.MM.JJJJ hh:mm:ss",
                                            );
                                        }
                                    } else {
                                        mac_add.offline_time = last_off.val;
                                        const diff_off = Date.now() - last_off.val;
                                        mac_add.offline_text = !mac_add.active_fritz
                                            ? this.timediff(diff_off)
                                            : "0 minutes";
                                        mac_add.active_fritz_time = mac_add.offline_text;
                                        mac_add.offline_utc = this.adapter.formatDate(
                                            last_off.val,
                                            "TT.MM.JJJJ hh:mm:ss",
                                        );
                                    }
                                } else {
                                    if (mac_add.active_fritz) {
                                        mac_add.online_time = Date.now();
                                        mac_add.online_utc = this.adapter.formatDate(new Date(), "TT.MM.JJJJ hh:mm:ss");
                                    } else {
                                        mac_add.offline_time = Date.now();
                                        mac_add.offline_utc = this.adapter.formatDate(
                                            new Date(),
                                            "TT.MM.JJJJ hh:mm:ss",
                                        );
                                    }
                                }
                            }
                        }
                        if (mac_check.indexOf("NewHostName") != -1) {
                            const name_fritz = mac_check.match("<NewHostName>(.*?)</NewHostName>");
                            if (name_fritz != null && name_fritz[1] != null) {
                                mac_add.name_fritz = typeof name_fritz[1] === "string" ? name_fritz[1] : "Unknown";
                            }
                        }
                        if (mac_check.indexOf("NewInterfaceType") != -1) {
                            const interface_fritz = mac_check.match("<NewInterfaceType>(.*?)</NewInterfaceType>");
                            if (interface_fritz != null && interface_fritz[1] != null) {
                                mac_add.interface_fritz =
                                    interface_fritz[1] != null ? interface_fritz[1].toString() : "";
                            }
                        }
                        if (mac_add.mac_object) {
                            if (first) {
                                first = false;
                                await this.adapter.createAbsenceFolder(this.config);
                            }
                            this.adapter.log.info(`${this.config.ip} - Start monitoring - ${mac.mac}`);
                            await this.adapter.createAbsence(this.config, mac_add);
                            this.all_mac.push(mac_add);
                        }
                        this.setStates(mac_add);
                    } else {
                        this.adapter.log.warn(`${this.config.ip} - Cannot found mac address ${mac.mac}`);
                    }
                }
            }
        }
        if (this.all_mac.length > 0) {
            this.chechStatus();
            this.startInterval();
            return true;
        }
        return false;
    }

    startInterval() {
        this.adapter.log.debug(`${this.config.ip} - Start mac interval with ${this.config.interval}`);
        this.checkinterval && this.adapter.clearInterval(this.checkinterval);
        this.checkinterval = this.adapter.setInterval(
            async () => {
                this.chechStatus();
            },
            this.config.interval * 60 * 1000,
        );
    }

    async chechStatus() {
        let count = 0;
        for (const phone of this.all_mac) {
            const mac_check = await this.requests(
                "/upnp/control/hosts",
                "urn:dslforum-org:service:Hosts:1",
                "GetSpecificHostEntry",
                `<NewMACAddress>${phone.mac}</NewMACAddress>`,
            );
            this.adapter.log.debug(`${this.config.ip} - Mac result: ${mac_check}`);
            if (mac_check != null && typeof mac_check === "string" && mac_check.indexOf("NewIPAddress") != -1) {
                phone.last_check = Date.now();
                const address = mac_check.match("<NewIPAddress>(.*?)</NewIPAddress>");
                if (address != null && address[1] != null && phone.ip_fritz != address[1]) {
                    phone.ip_fritz = typeof address[1] === "string" ? address[1] : "";
                }
                if (mac_check.indexOf("NewAddressSource") != -1) {
                    const addsource = mac_check.match("<NewAddressSource>(.*?)</NewAddressSource>");
                    if (addsource != null && addsource[1] != null && phone.source_fritz != addsource[1]) {
                        phone.source_fritz = typeof addsource[1] === "string" ? addsource[1] : "";
                    }
                }
                if (mac_check.indexOf("NewLeaseTimeRemaining") != -1) {
                    const remaining = mac_check.match("<NewLeaseTimeRemaining>(.*?)</NewLeaseTimeRemaining>");
                    if (remaining != null && remaining[1] != null && phone.remaining_fritz != remaining[1]) {
                        phone.remaining_fritz = typeof remaining[1] === "string" ? parseInt(remaining[1]) : 0;
                    }
                }
                if (mac_check.indexOf("NewActive") != -1) {
                    const active_fritz = mac_check.match("<NewActive>(.*?)</NewActive>");
                    if (active_fritz != null && active_fritz[1] != null) {
                        if (phone.active_fritz == 1 && active_fritz[1] != phone.active_fritz) {
                            if (phone.offline_time_temp === 0) {
                                phone.offline_time_temp = Date.now();
                                phone.offline_minutes = 1;
                                phone.offline_text = this.timediff(60001);
                            } else {
                                const last_off = Date.now() - phone.offline_time_temp;
                                if (phone.off_time > last_off) {
                                    phone.offline_text = this.timediff(last_off);
                                    phone.offline_minutes = Math.ceil(last_off / 60 / 1000);
                                } else {
                                    phone.offline_time = Date.now();
                                    phone.offline_utc = this.adapter.formatDate(new Date(), "TT.MM.JJJJ hh:mm:ss");
                                    phone.offline_time_temp = 0;
                                    phone.active_fritz = 0;
                                }
                            }
                        }
                        if (phone.active_fritz == 1 && phone.offline_minutes > 0) {
                            phone.offline_minutes = 0;
                        }
                        if (phone.active_fritz == 0 && active_fritz[1] != phone.active_fritz) {
                            phone.offline_minutes = 0;
                            phone.online_time = Date.now();
                            phone.online_utc = this.adapter.formatDate(new Date(), "TT.MM.JJJJ hh:mm:ss");
                            phone.active_fritz = 1;
                        }
                        if (phone.active_fritz == 1 && active_fritz[1] == phone.active_fritz) {
                            phone.active_fritz_text = "✅ anwesend";
                            ++count;
                            const last_on = Date.now() - phone.online_time;
                            phone.online_text = this.timediff(last_on);
                            phone.online_minutes = Math.ceil(last_on / 60 / 1000);
                        }
                        if (phone.active_fritz == 0 && active_fritz[1] == phone.active_fritz) {
                            phone.active_fritz_text = "❗️ abwesend";
                            if (phone.offline_time == 0) {
                                phone.offline_time = Date.now();
                                phone.offline_utc = this.adapter.formatDate(new Date(), "TT.MM.JJJJ hh:mm:ss");
                                phone.offline_minutes = 1;
                                phone.offline_text = this.timediff(60001);
                            } else {
                                const last_off = Date.now() - phone.offline_time;
                                phone.offline_text = this.timediff(last_off);
                                phone.offline_minutes = Math.ceil(last_off / 60 / 1000);
                            }
                        }
                        if (phone.active_fritz == 0) {
                            phone.active_fritz_time = phone.offline_text;
                        } else {
                            phone.active_fritz_time = phone.online_text;
                        }
                    }
                }
                if (mac_check.indexOf("NewHostName") != -1) {
                    const name_fritz = mac_check.match("<NewHostName>(.*?)</NewHostName>");
                    if (name_fritz != null && name_fritz[1] != null && phone.name_fritz != name_fritz[1]) {
                        phone.name_fritz = typeof name_fritz[1] === "string" ? name_fritz[1] : "Unknown";
                    }
                }
                if (mac_check.indexOf("NewInterfaceType") != -1) {
                    const interface_fritz = mac_check.match("<NewInterfaceType>(.*?)</NewInterfaceType>");
                    if (
                        interface_fritz != null &&
                        interface_fritz[1] != null &&
                        phone.interface_fritz != interface_fritz[1]
                    ) {
                        phone.interface_fritz = interface_fritz[1] != null ? interface_fritz[1].toString() : "";
                    }
                }
            } else {
                let lastTime = phone.offline_time;
                lastTime = Date.now() - phone.offline_time;
                phone.offline_minutes = phone.offline_minutes + lastTime;
                phone.active_fritz = 0;
            }
            phone.last_check = Date.now();
            this.setStates(phone);
        }
        const object_path = `${this.config.dp}.TR_064.Presence.status_all`;
        if (!this.checkvalue[object_path] || this.checkvalue[object_path] != count) {
            await this.adapter.setState(object_path, { val: count, ack: true });
        }
        await this.adapter.setState(`${this.config.dp}.TR_064.Presence.status_all_json`, {
            val: JSON.stringify(this.all_mac),
            ack: true,
        });
    }

    async setStates(val) {
        let object_path = `${this.config.dp}.TR_064.Presence.${val.mac_object}.status`;
        let check = JSON.stringify(val.active_fritz);
        if (!this.checkvalue[object_path] || this.checkvalue[object_path] != check) {
            this.checkvalue[object_path] == check;
            await this.adapter.setState(object_path, { val: val.active_fritz ? true : false, ack: true });
        }
        object_path = `${this.config.dp}.TR_064.Presence.${val.mac_object}.lastonline`;
        check = JSON.stringify(val.online_time);
        if (!this.checkvalue[object_path] || this.checkvalue[object_path] != check) {
            this.checkvalue[object_path] == check;
            await this.adapter.setState(object_path, { val: val.online_time, ack: true });
        }
        object_path = `${this.config.dp}.TR_064.Presence.${val.mac_object}.lastoffline`;
        check = JSON.stringify(val.offline_time);
        if (!this.checkvalue[object_path] || this.checkvalue[object_path] != check) {
            this.checkvalue[object_path] == check;
            await this.adapter.setState(object_path, { val: val.offline_time, ack: true });
        }
        object_path = `${this.config.dp}.TR_064.Presence.${val.mac_object}.ip`;
        check = JSON.stringify(val.ip_fritz);
        if (!this.checkvalue[object_path] || this.checkvalue[object_path] != check) {
            this.checkvalue[object_path] == check;
            await this.adapter.setState(object_path, { val: val.ip_fritz, ack: true });
        }
        object_path = `${this.config.dp}.TR_064.Presence.${val.mac_object}.mac`;
        check = JSON.stringify(val.mac);
        if (!this.checkvalue[object_path] || this.checkvalue[object_path] != check) {
            this.checkvalue[object_path] == check;
            await this.adapter.setState(object_path, { val: val.mac, ack: true });
        }
        object_path = `${this.config.dp}.TR_064.Presence.${val.mac_object}.namefritz`;
        check = JSON.stringify(val.name_fritz);
        if (!this.checkvalue[object_path] || this.checkvalue[object_path] != check) {
            this.checkvalue[object_path] == check;
            await this.adapter.setState(object_path, { val: val.name_fritz, ack: true });
        }
        object_path = `${this.config.dp}.TR_064.Presence.${val.mac_object}.name`;
        check = JSON.stringify(val.name);
        if (!this.checkvalue[object_path] || this.checkvalue[object_path] != check) {
            this.checkvalue[object_path] == check;
            await this.adapter.setState(object_path, { val: val.name, ack: true });
        }
        object_path = `${this.config.dp}.TR_064.Presence.${val.mac_object}.currentoffline`;
        check = JSON.stringify(val.offline_minutes);
        if (!this.checkvalue[object_path] || this.checkvalue[object_path] != check) {
            this.checkvalue[object_path] == check;
            await this.adapter.setState(object_path, { val: val.offline_minutes, ack: true });
        }
        object_path = `${this.config.dp}.TR_064.Presence.${val.mac_object}.currentonline`;
        check = JSON.stringify(val.online_minutes);
        if (!this.checkvalue[object_path] || this.checkvalue[object_path] != check) {
            this.checkvalue[object_path] == check;
            await this.adapter.setState(object_path, { val: val.online_minutes, ack: true });
        }
        object_path = `${this.config.dp}.TR_064.Presence.${val.mac_object}.json`;
        check = JSON.stringify(val);
        if (!this.checkvalue[object_path] || this.checkvalue[object_path] != check) {
            this.checkvalue[object_path] == check;
            await this.adapter.setState(object_path, { val: check, ack: true });
        }
    }

    destroy() {
        this.checkinterval && this.adapter.clearInterval(this.checkinterval);
        this.checkinterval = null;
    }

    timediff(diff) {
        const d = Math.floor(diff / (1000 * 60 * 60 * 24));
        diff = diff % (1000 * 60 * 60 * 24);
        const h = Math.floor(diff / (1000 * 60 * 60));
        diff = diff % (1000 * 60 * 60);
        const m = Math.floor(diff / (1000 * 60));
        // diff = diff % (1000 * 60);
        // const s = Math.floor(diff / 1000);
        // const ms = diff % 1000;
        const d_name = d === 1 ? "day" : "days";
        const h_name = h === 1 ? "hour" : "hours";
        const m_name = m === 1 ? "minute" : "minutes";
        if (d > 0) {
            return `${d} ${d_name}, ${h} ${h_name}, ${m} ${m_name}`;
        } else if (h > 0) {
            return `${h} ${h_name}, ${m} ${m_name}`;
        } else if (m > 0) {
            return `${m} ${m_name}`;
        }
        return `0 minutes`;
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
                this.adapter.log.debug(`${this.config.ip} - OUT: ${out.stdout} - ${out.stderr}`);
                try {
                    if (out.stdout) {
                        return out.stdout;
                    }
                    if (out.stdout.toString().indexOf("Unauthorized") !== -1) {
                        return "Unauthorized";
                    }
                    return out.stdout;
                } catch (e) {
                    this.adapter.log.debug(`${this.config.ip} - catch exec: ${JSON.stringify(e)}`);
                    return false;
                }
            },
            err => {
                this.adapter.log.debug(`${this.config.ip} - requests: ${JSON.stringify(err)}`);
                return false;
            },
        );
    }
}

module.exports = MACMonitor;
