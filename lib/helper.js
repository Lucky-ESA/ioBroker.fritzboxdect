module.exports = {
    /**
     * @param {object} id
     * @param {object} devices
     * @param {object} com
     * @param {string} dp_name
     */
    async createChannels(id, devices, com, dp_name) {
        let common = {};
        let device_array = [];
        if (Object.keys(devices).length == 0) {
            return;
        } else if (Object.keys(devices).length == 1) {
            device_array.push(devices);
        } else {
            device_array = devices;
        }
        if (!this.dect_device[id.dp]) {
            this.dect_device[id.dp] = {};
        }
        let alert = false;
        for (const device of device_array) {
            alert = false;
            if (device.functionbitmask != 1) {
                const icon = this.getIcon(device.functionbitmask, device.productname, dp_name);
                if (device.functionbitmask != null) {
                    device.functionbitmask = `${device.functionbitmask} - ${this.getmask(device.functionbitmask)}`;
                }
                if (
                    device.etsiunitinfo &&
                    device.etsiunitinfo.unittype &&
                    (device.etsiunitinfo.unittype == 513 || device.etsiunitinfo.unittype == 514)
                ) {
                    alert = true;
                }
                const ident = `${dp_name}_${device.identifier.replace(/\s/g, "").replace(/-1/g, "")}`;
                if (device.productname === "FRITZ!DECT 500") {
                    device.colorcontrol.hex = "#000000";
                }
                if (!this.dect_device[id.dp][device.productname]) {
                    this.dect_device[id.dp][device.productname] = [];
                }
                this.dect_device[id.dp][device.productname].push(device);
                common = {
                    name: device.name,
                    desc: device.name,
                    icon: icon,
                };
                if (dp_name === "TEMPLATE") {
                    await this.createDataPoint(`${id.dp}.${ident}.metadata`, com.commons["metadata"], "folder", null);
                    await this.createDataPoint(
                        `${id.dp}.${ident}.metadata.setMetadata`,
                        com.commons["setMetadata"],
                        "state",
                        false,
                    );
                    await this.createDataPoint(`${id.dp}.${ident}.metadata.icon`, com.commons["icon"], "state", -1);
                    await this.createDataPoint(
                        `${id.dp}.${ident}.metadata.type`,
                        com.commons["type"],
                        "state",
                        "no set",
                    );
                    await this.createDataPoint(
                        `${id.dp}.${ident}.apply`,
                        com.commons["apply_template"],
                        "state",
                        false,
                    );
                }
                await this.createDataPoint(`${id.dp}.${ident}`, common, "channel", null);
                for (const key in device) {
                    if (typeof device[key] === "object") {
                        if (dp_name != "TEMPLATE") {
                            common = {
                                name: key,
                                desc: key,
                                icon: icon,
                            };
                            await this.createDataPoint(`${id.dp}.${ident}.${key}`, common, "folder", null);
                        }
                        if (
                            !Array.isArray(device[key]) &&
                            key != "devices" &&
                            key != "triggers" &&
                            key != "sub_templates" &&
                            key != "applymask"
                        ) {
                            for (const subkey in device[key]) {
                                if (typeof device[key][subkey] === "object") {
                                    common = {
                                        name: subkey,
                                        desc: subkey,
                                        icon: icon,
                                    };
                                    await this.createDataPoint(
                                        `${id.dp}.${ident}.${key}.${subkey}`,
                                        common,
                                        "folder",
                                        null,
                                    );
                                    if (subkey === "device" && Array.isArray(device[key][subkey])) {
                                        for (const subsubkey in device[key][subkey]) {
                                            for (const dubkey in device[key][subkey][subsubkey]) {
                                                if (com && com.commons && com.commons[dubkey]) {
                                                    await this.createDataPoint(
                                                        `${id.dp}.${ident}.${key}.${subkey}.${dubkey}${subsubkey}`,
                                                        com.commons[dubkey],
                                                        "state",
                                                        device[key][subkey][subsubkey][dubkey],
                                                    );
                                                } else {
                                                    this.log.warn(
                                                        `DoubleKey ${dubkey} is unknown. Please create an issue!`,
                                                    );
                                                }
                                            }
                                        }
                                    } else {
                                        for (const subsubkey in device[key][subkey]) {
                                            if (com && com.commons && com.commons[subsubkey]) {
                                                await this.createDataPoint(
                                                    `${id.dp}.${ident}.${key}.${subkey}.${subsubkey}`,
                                                    com.commons[subsubkey],
                                                    "state",
                                                    device[key][subkey][subsubkey],
                                                );
                                            } else {
                                                this.log.warn(
                                                    `SubSubKey ${subsubkey} is unknown. Please create an issue!`,
                                                );
                                            }
                                        }
                                    }
                                } else {
                                    if (com && com.commons && com.commons[subkey]) {
                                        if (key == "alert" && subkey == "state" && !alert) {
                                            common = com.commons["alertstate"];
                                        } else if (key == "alert" && subkey == "state" && alert) {
                                            common = com.commons["alertstate_sensor"];
                                        } else if (key == "simpleonoff" && subkey == "state") {
                                            common = com.commons["simpleonoff"];
                                        } else {
                                            common = com.commons[subkey];
                                        }
                                        if (subkey === "interfaces") {
                                            device[key][subkey] = this.getinterfaces(device[key][subkey]);
                                        }
                                        await this.createDataPoint(
                                            `${id.dp}.${ident}.${key}.${subkey}`,
                                            common,
                                            "state",
                                            device[key][subkey],
                                        );
                                    } else {
                                        this.log.warn(`subKeys ${subkey} is unknown. Please create an issue!`);
                                    }
                                }
                            }
                        } else {
                            if (
                                key === "devices" ||
                                key === "triggers" ||
                                key === "sub_templates" ||
                                key === "applymask"
                            ) {
                                if (com && com.commons && com.commons[key]) {
                                    common = com.commons[key];
                                    await this.createDataPoint(
                                        `${id.dp}.${ident}.${key}`,
                                        common,
                                        "state",
                                        JSON.stringify(device[key]),
                                    );
                                } else {
                                    this.log.warn(`Keys ${key} is unknown. Please create an issue!`);
                                }
                            } else {
                                for (const button of device[key]) {
                                    this.log.debug(`BUTTON: ${JSON.stringify(button)}`);
                                    const ident_button = button.identifier.replace(/\s/g, "");
                                    common = {
                                        name: button.name,
                                        desc: button.name,
                                        icon: icon,
                                    };
                                    await this.createDataPoint(
                                        `${id.dp}.${ident}.${key}.${ident_button}`,
                                        common,
                                        "folder",
                                        null,
                                    );
                                    for (const keys in button) {
                                        if (com && com.commons && com.commons[keys]) {
                                            common = com.commons[keys];
                                            await this.createDataPoint(
                                                `${id.dp}.${ident}.${key}.${ident_button}.${keys}`,
                                                common,
                                                "state",
                                                button[keys],
                                            );
                                        } else {
                                            this.log.warn(`Keys ${keys} is unknown. Please create an issue!`);
                                        }
                                    }
                                }
                            }
                        }
                    } else {
                        if (com && com.commons && com.commons[key]) {
                            common = com.commons[key];
                            await this.createDataPoint(`${id.dp}.${ident}.${key}`, common, "state", device[key]);
                        } else {
                            this.log.warn(`LastKey ${key} is unknown. Please create an issue!`);
                        }
                    }
                }
                device.ident = ident;
            } else {
                if (dp_name === "TRIGGER") {
                    const icon = "/img/trigger.png";
                    const ident = `${dp_name}_${device.identifier.replace(/\s/g, "").replace(/-1/g, "")}`;
                    for (const key in device) {
                        common = {
                            name: device.name,
                            desc: device.name,
                            icon: icon,
                        };
                        await this.createDataPoint(`${id.dp}.${ident}`, common, "channel", null);
                        for (const subkey in device[key]) {
                            if (com && com.commons && com.commons[subkey]) {
                                common = com.commons[subkey];
                                await this.createDataPoint(
                                    `${id.dp}.${ident}.${key}.${subkey}`,
                                    common,
                                    "state",
                                    device[key][subkey],
                                );
                            } else {
                                this.log.warn(`Key ${subkey} is unknown. Please create an issue!`);
                            }
                        }
                    }
                    device.ident = ident;
                }
            }
        }
        if (this.dect_device[id.dp]["FRITZ!DECT 500"] && dp_name === "DECT") {
            if (this.dect_device[id.dp]["FRITZ!DECT 500"].length > 0) {
                this.createColorTemplate(id, this.dect_device[id.dp]["FRITZ!DECT 500"]);
            }
        }
    },
    /**
     * @param {object} id
     * @param {object} dect
     */
    async createColorTemplate(id, dect) {
        let common = {};
        common = {
            name: {
                en: "Add color template",
                de: "Farbvorlage hinzufügen",
                ru: "Добавить шаблон цвета",
                pt: "Adicionar modelo de cor",
                nl: "Kleursjabloon toevoegen",
                fr: "Ajouter un modèle de couleur",
                it: "Aggiungi il modello di colore",
                es: "Añadir plantilla de color",
                pl: "Dodaj szablon kolorów",
                uk: "Додати шаблон кольору",
                "zh-cn": "添加颜色模板",
            },
            desc: "Add color template",
            icon: "/img/color_palette.png",
        };
        await this.createDataPoint(`${id.dp}.DECT_Control.addColorTemplate`, common, "folder", null);
        common = {
            name: {
                en: "Create color template",
                de: "Farbvorlage erstellen",
                ru: "Создать шаблон цвета",
                pt: "Criar modelo de cor",
                nl: "Kleursjabloon aanmaken",
                fr: "Créer un modèle de couleur",
                it: "Crea il modello di colore",
                es: "Crear plantilla de color",
                pl: "Utwórz szablon kolorów",
                uk: "Створення шаблону кольору",
                "zh-cn": "创建颜色模板",
            },
            type: "boolean",
            role: "button",
            desc: "Create color template",
            read: false,
            write: true,
            def: false,
        };
        await this.createDataPoint(
            `${id.dp}.DECT_Control.addColorTemplate.createColorTemplates`,
            common,
            "state",
            false,
        );
        common = {
            name: {
                en: "Create temperature color template",
                de: "Temperatur-Farbvorlage erstellen",
                ru: "Создать шаблон цвета температуры",
                pt: "Criar modelo de cor de temperatura",
                nl: "Temperatuurkleursjabloon aanmaken",
                fr: "Créer un modèle de couleur de température",
                it: "Crea il modello di colore della temperatura",
                es: "Crear plantilla de color de temperatura",
                pl: "Tworzenie szablonu kolorów temperatury",
                uk: "Створення шаблону кольору температури",
                "zh-cn": "创建温度颜色模板",
            },
            type: "boolean",
            role: "button",
            desc: "Create temperature template",
            read: false,
            write: true,
            def: false,
        };
        await this.createDataPoint(
            `${id.dp}.DECT_Control.addColorTemplate.createTemperatureTemplates`,
            common,
            "state",
            false,
        );
        common = {
            name: {
                en: "Name from Template",
                de: "Name der Vorlage",
                ru: "Имя из шаблона",
                pt: "Nome do modelo",
                nl: "Naam van sjabloon",
                fr: "Nom du modèle",
                it: "Nome da Template",
                es: "Nombre de la Plantilla",
                pl: "Nazwa z szablonu",
                uk: "Ім'я з шаблону",
                "zh-cn": "模板中的名称",
            },
            type: "string",
            role: "state",
            desc: "Name from Template",
            read: true,
            write: true,
            def: "",
        };
        await this.createDataPoint(`${id.dp}.DECT_Control.addColorTemplate.name_template`, common, "state", "");
        common = {
            name: {
                en: "HUE (0-359)",
                de: "HUE (0-359)",
                ru: "HUE (0-359)",
                pt: "HUE (0-359)",
                nl: "HUE (0-359)",
                fr: "HUE (0-359)",
                it: "HUE (0-359)",
                es: "HUE (0-359)",
                pl: "HUE (0- 359)",
                uk: "HUE (0-359)",
                "zh-cn": "胡适(0-359)",
            },
            type: "number",
            role: "value",
            desc: "HUE (0-359)",
            read: true,
            write: true,
            def: 0,
            min: 0,
            max: 359,
        };
        await this.createDataPoint(`${id.dp}.DECT_Control.addColorTemplate.hue_template`, common, "state", 0);
        common = {
            name: {
                en: "Saturation (0-255)",
                de: "Sättigung (0-255)",
                ru: "Saturation (0-255)",
                pt: "Saturação (0-255)",
                nl: "Verzadiging (0-255)",
                fr: "Saturation (0-255)",
                it: "Saturazione (0-255)",
                es: "Saturación (0-255)",
                pl: "Nasycenie (0- 255)",
                uk: "Закінчення (0-255)",
                "zh-cn": "饱和度( 0 - 255)",
            },
            type: "number",
            role: "value",
            desc: "Saturation (0-255)",
            read: true,
            write: true,
            def: 0,
            min: 0,
            max: 255,
        };
        await this.createDataPoint(`${id.dp}.DECT_Control.addColorTemplate.saturation_template`, common, "state", 0);
        common = {
            name: {
                en: "Level percentage (0-100)",
                de: "Niveauprozent (0-100)",
                ru: "Процентная доля (0-100)",
                pt: "Percentagem de nível (0-100)",
                nl: "Niveaupercentage (0-100)",
                fr: "Niveau (0-100)",
                it: "Percentuale di livello (0-100)",
                es: "Porcentaje de nivel (0 a 100)",
                pl: "Udział procentowy (0- 100)",
                uk: "Відсоток рівня (0-100)",
                "zh-cn": "职等百分比(0-100)",
            },
            type: "number",
            role: "level",
            desc: "Level percentage (0-100)",
            read: true,
            write: true,
            def: 0,
            min: 0,
            max: 100,
            unit: "%",
        };
        await this.createDataPoint(
            `${id.dp}.DECT_Control.addColorTemplate.levelPercentage_template`,
            common,
            "state",
            0,
        );
        common = {
            name: {
                en: "Temperature",
                de: "Temperatur",
                ru: "Температура",
                pt: "Temperatura",
                nl: "Temperatuur",
                fr: "Température",
                it: "Temperatura",
                es: "Temperatura",
                pl: "Temperatura",
                uk: "Погода",
                "zh-cn": "模范",
            },
            type: "number",
            role: "level.color.temperature",
            write: true,
            read: true,
            def: -1,
            min: -1,
            max: 6500,
            unit: "K",
            states: {
                0: "Keine Licht",
                2700: "Warmweiß_1",
                3000: "Warmweiß_2",
                3400: "Warmweiß_3",
                3800: "Neutral_1",
                4200: "Neutral_2",
                4700: "Neutral_3",
                5300: "Tageslicht_1",
                5900: "Tageslicht_1",
                6500: "Tageslicht_1",
            },
        };
        await this.createDataPoint(
            `${id.dp}.DECT_Control.addColorTemplate.colorTemperature_template`,
            common,
            "state",
            0,
        );
        common = {
            name: {
                en: "Use defaults colors",
                de: "Standardfarben verwenden",
                ru: "Использовать цвета по умолчанию",
                pt: "Use cores padrão",
                nl: "Standaardkleuren gebruiken",
                fr: "Utiliser les couleurs par défaut",
                it: "Utilizzare i colori di default",
                es: "Usar colores predeterminados",
                pl: "Użyj domyślnych kolorów",
                uk: "Використання кольорів за замовчуванням",
                "zh-cn": "使用默认颜色",
            },
            type: "boolean",
            role: "switch",
            write: true,
            read: true,
            def: false,
        };
        await this.createDataPoint(`${id.dp}.DECT_Control.addColorTemplate.colorpreset`, common, "state", false);
        for (const dev of dect) {
            const ident = `DECT_${dev.identifier.replace(/\s/g, "").replace(/-1/g, "")}`;
            common = {
                name: dev.name,
                type: "boolean",
                role: "switch",
                desc: "device",
                write: true,
                read: true,
                def: false,
            };
            await this.createDataPoint(`${id.dp}.DECT_Control.addColorTemplate.${ident}`, common, "state", false);
        }
        const all_dev = dect.length + 8;
        const all_state = await this.getObjectViewAsync("system", "state", {
            startkey: `${this.namespace}.${id.dp}.DECT_Control.addColorTemplate.`,
            endkey: `${this.namespace}.${id.dp}.DECT_Control.addColorTemplate.\u9999`,
        });
        if (all_state.rows.length > all_dev) {
            for (const dev of all_state.rows) {
                if (dev.value && dev.value.common && dev.value.common.desc === "device") {
                    const element = dev.id.pop();
                    const find_dp = dect.filter(item => item.ident === element);
                    this.log.info(`Detele state ${dev.id}`);
                    if (!find_dp) {
                        await this.delObjectAsync(dev.id, {
                            recursive: true,
                        });
                    }
                }
            }
        }
    },
    /**
     * @param {object} id
     */
    async createPhonebook(id) {
        let common = {};
        common = {
            name: {
                en: "Phonebooks",
                de: "Telefonbücher",
                ru: "Телефонные книги",
                pt: "Livros de telefone",
                nl: "Telefoonboeken",
                fr: "Livres téléphoniques",
                it: "Schede telefoniche",
                es: "Libros de teléfono",
                pl: "Phonebooks",
                uk: "Контакти",
                "zh-cn": "电话簿",
            },
            desc: "Call logs",
            icon: "img/phonebook.png",
        };
        await this.createDataPoint(`${id.dp}.TR_064.Phonebooks`, common, "folder", null);
    },
    /**
     * @param {object} id
     */
    async createCallLog(id) {
        let common = {};
        common = {
            name: {
                en: "Call logs",
                de: "Anrufprotokolle",
                ru: "Звонки",
                pt: "Registos de chamadas",
                nl: "Oproeplogboeken",
                fr: "Journaux d'appel",
                it: "Tronchi di chiamata",
                es: "Registros de llamadas",
                pl: "Rejestry połączeń",
                uk: "Журнали дзвінків",
                "zh-cn": "调用日志",
            },
            desc: "Call logs",
            icon: "img/callmonitor.png",
        };
        await this.createDataPoint(`${id.dp}.TR_064.Calllists`, common, "folder", null);
        common = {
            name: {
                en: "Incomming calls",
                de: "Eingehende Anrufe",
                ru: "Разговорные звонки",
                pt: "Chamadas de computador",
                nl: "Aanbevelen van oproepen",
                fr: "Entrant",
                it: "Raccomandare le chiamate",
                es: "Llamadas de facturación",
                pl: "Rozmowy dochodzące",
                uk: "Вхід",
                "zh-cn": "监听电话",
            },
            desc: "Incomming calls",
            icon: "img/inbound.png",
        };
        await this.createDataPoint(`${id.dp}.TR_064.Calllists.incomming`, common, "folder", null);
        common = {
            name: {
                en: "Outgoing calls",
                de: "Abgehende Anrufe",
                ru: "Выходные звонки",
                pt: "Chamadas de saída",
                nl: "Uitgaande oproepen",
                fr: "Appels sortants",
                it: "Chiamate in uscita",
                es: "Llamadas salientes",
                pl: "Rozmowy wychodzące",
                uk: "Вихідні дзвінки",
                "zh-cn": "正在通话",
            },
            desc: "Outgoing calls",
            icon: "img/outbound.png",
        };
        await this.createDataPoint(`${id.dp}.TR_064.Calllists.outgoing`, common, "folder", null);
        common = {
            name: {
                en: "Missed calls",
                de: "Anrufe in Abwesenheit",
                ru: "Пропущенные звонки",
                pt: "Chamadas perdidas",
                nl: "Gemiste oproepen",
                fr: "Appels manquants",
                it: "Chiamate scomparse",
                es: "Llamadas perdidas",
                pl: "Nieodebrane rozmowy",
                uk: "Відомі дзвінки",
                "zh-cn": "错过了电话",
            },
            desc: "Missed calls",
            icon: "img/missed.png",
        };
        await this.createDataPoint(`${id.dp}.TR_064.Calllists.missed`, common, "folder", null);
        common = {
            name: {
                en: "Calls counter",
                de: "Anrufzähler",
                ru: "Счетчик",
                pt: "Contador de chamadas",
                nl: "Aanroepen teller",
                fr: "Compteur d'appels",
                it: "Contatore chiamate",
                es: "Llama al contador",
                pl: "Licznik połączeń",
                uk: "Дзвінки",
                "zh-cn": "电话柜台",
            },
            type: "number",
            role: "state",
            desc: "Status",
            read: true,
            write: false,
            def: 0,
        };
        await this.createDataPoint(`${id.dp}.TR_064.Calllists.incomming.count`, common, "state", null);
        await this.createDataPoint(`${id.dp}.TR_064.Calllists.outgoing.count`, common, "state", null);
        await this.createDataPoint(`${id.dp}.TR_064.Calllists.missed.count`, common, "state", null);
        common = {
            name: {
                en: "Calls as JSON",
                de: "Anrufe als JSON",
                ru: "Звонок как JSON",
                pt: "Chama como JSON",
                nl: "Oproepen als JSON",
                fr: "Appels en tant que JSON",
                it: "Chiama come JSON",
                es: "Llama como JSON",
                pl: "Dzwoni jako JSON",
                uk: "Дзвоните до JSON",
                "zh-cn": "打电话叫JSON",
            },
            type: "string",
            role: "json",
            desc: "Calls as JSON",
            read: true,
            write: false,
            def: "{}",
        };
        await this.createDataPoint(`${id.dp}.TR_064.Calllists.incomming.json`, common, "state", null);
        await this.createDataPoint(`${id.dp}.TR_064.Calllists.outgoing.json`, common, "state", null);
        await this.createDataPoint(`${id.dp}.TR_064.Calllists.missed.json`, common, "state", null);
    },
    /**
     * @param {object} id
     */
    async createAbsenceFolder(id) {
        let common = {};
        common = {
            name: {
                en: "Presence detection",
                de: "Präsenzerkennung",
                ru: "Обнаружение",
                pt: "Detecção de presença",
                nl: "Aanwezigheidsdetectie",
                fr: "Détection de la présence",
                it: "Rilevamento di presenza",
                es: "Detección de presencia",
                pl: "Wykrywanie obecności",
                uk: "Визначення ступеня",
                "zh-cn": "现场检测",
            },
            desc: "Presence detection",
            icon: "img/presence.png",
        };
        await this.createDataPoint(`${id.dp}.TR_064.Presence`, common, "folder", null);
        common = {
            name: {
                en: "Devices online",
                de: "Geräte online",
                ru: "Устройства онлайн",
                pt: "Dispositivos online",
                nl: "Apparaten online",
                fr: "Appareils en ligne",
                it: "Dispositivi online",
                es: "Dispositivos en línea",
                pl: "Urządzenia online",
                uk: "Пристрої онлайн",
                "zh-cn": "在线设备",
            },
            type: "number",
            role: "state",
            desc: "Devices online",
            read: true,
            write: false,
            def: 0,
        };
        await this.createDataPoint(`${id.dp}.TR_064.Presence.status_all`, common, "state", null);
        common = {
            name: {
                en: "Devices online as JSON",
                de: "Geräte online als JSON",
                ru: "Устройства онлайн как JSON",
                pt: "Dispositivos online como JSON",
                nl: "Apparaten online als JSON",
                fr: "Dispositifs en ligne comme JSON",
                it: "Dispositivi online come JSON",
                es: "Dispositivos en línea como JSON",
                pl: "Urządzenia online jako JSON",
                uk: "Пристрої онлайн як JSON",
                "zh-cn": "作为 JSON 在线设备",
            },
            type: "string",
            role: "json",
            desc: "Devices online as JSON",
            read: true,
            write: false,
            def: "",
        };
        await this.createDataPoint(`${id.dp}.TR_064.Presence.status_all_json`, common, "state", null);
    },
    /**
     * @param {object} id
     * @param {object} val
     */
    async createAbsence(id, val) {
        let common = {};
        common = {
            name: val.name_fritz != "" ? val.name_fritz : val.name,
            desc: "Phone",
            icon: "img/phone.png",
        };
        await this.createDataPoint(`${id.dp}.TR_064.Presence.${val.mac_object}`, common, "folder", null);
        common = {
            name: {
                en: "Status",
                de: "Status",
                ru: "Статус",
                pt: "Estado",
                nl: "Status",
                fr: "État",
                it: "Stato",
                es: "Situación",
                pl: "Status",
                uk: "Статус на сервери",
                "zh-cn": "状态",
            },
            type: "boolean",
            role: "indicator.reachable",
            desc: "Status",
            read: true,
            write: false,
            def: false,
        };
        await this.createDataPoint(`${id.dp}.TR_064.Presence.${val.mac_object}.status`, common, "state", null);
        common = {
            name: {
                en: "JSON",
                de: "JSON",
                ru: "JSON",
                pt: "JSON",
                nl: "JSON",
                fr: "JSON",
                it: "JSON",
                es: "JSON",
                pl: "JSON",
                uk: "СОНЦЕ",
                "zh-cn": "贾森",
            },
            type: "string",
            role: "json",
            desc: "JSON",
            read: true,
            write: false,
            def: "{}",
        };
        await this.createDataPoint(`${id.dp}.TR_064.Presence.${val.mac_object}.json`, common, "state", null);
        common = {
            name: {
                en: "Last time online",
                de: "Letztes Mal online",
                ru: "Последний раз онлайн",
                pt: "Última vez online",
                nl: "Laatste keer online",
                fr: "Dernière fois en ligne",
                it: "Ultima volta online",
                es: "Última vez online",
                pl: "Ostatni raz online",
                uk: "Останній раз онлайн",
                "zh-cn": "上次在线",
            },
            type: "number",
            role: "value.time",
            desc: "Last time online",
            read: true,
            write: false,
            def: 0,
        };
        await this.createDataPoint(`${id.dp}.TR_064.Presence.${val.mac_object}.lastonline`, common, "state", null);
        common = {
            name: {
                en: "Last time Offline",
                de: "Letztes Mal Offline",
                ru: "Последний раз",
                pt: "Última vez Offline",
                nl: "Laatste keer offline",
                fr: "Dernière sortie",
                it: "Last time Offline",
                es: "Última vez Sin conexión",
                pl: "Ostatni raz Offline",
                uk: "Останній раз офлайн",
                "zh-cn": "上次下线",
            },
            type: "number",
            role: "value.time",
            desc: "Last time Offline",
            read: true,
            write: false,
            def: 0,
        };
        await this.createDataPoint(`${id.dp}.TR_064.Presence.${val.mac_object}.lastoffline`, common, "state", null);
        common = {
            name: {
                en: "IP",
                de: "IP",
                ru: "IP",
                pt: "IP",
                nl: "IP",
                fr: "IP",
                it: "IP",
                es: "IP",
                pl: "IP",
                uk: "ІМ'Я",
                "zh-cn": "执行伙伴",
            },
            type: "string",
            role: "info.ip",
            desc: "IP",
            read: true,
            write: false,
            def: "",
        };
        await this.createDataPoint(`${id.dp}.TR_064.Presence.${val.mac_object}.ip`, common, "state", null);
        common = {
            name: {
                en: "MAC",
                de: "MAC",
                ru: "MAC",
                pt: "MAC",
                nl: "MAC",
                fr: "MAC",
                it: "MAC",
                es: "MAC",
                pl: "MAC",
                uk: "МАПА",
                "zh-cn": "邮件",
            },
            type: "string",
            role: "info.mac",
            desc: "MAC",
            read: true,
            write: false,
            def: "",
        };
        await this.createDataPoint(`${id.dp}.TR_064.Presence.${val.mac_object}.mac`, common, "state", null);
        common = {
            name: {
                en: "Name into the Fritzbox",
                de: "Name in der Fritzbox",
                ru: "Имя в Фрицбокс",
                pt: "Nome no Fritzbox",
                nl: "Naam in de Fritzbox",
                fr: "Nom dans la Fritzbox",
                it: "Nome nel Fritzbox",
                es: "Nombre en el Fritzbox",
                pl: "Nazwa do skrzynki na Fritzboxa",
                uk: "Ім'я в Fritzbox",
                "zh-cn": "名称输入弗里茨盒",
            },
            type: "string",
            role: "info.mac",
            desc: "Name into thr Fritzbox",
            read: true,
            write: false,
            def: "",
        };
        await this.createDataPoint(`${id.dp}.TR_064.Presence.${val.mac_object}.namefritz`, common, "state", null);
        common = {
            name: {
                en: "Name",
                de: "Name",
                ru: "Имя",
                pt: "Nome",
                nl: "Naam",
                fr: "Dénomination",
                it: "Nome",
                es: "Nombre",
                pl: "Nazwa",
                uk: "Ім'я",
                "zh-cn": "名称",
            },
            type: "string",
            role: "info.name",
            desc: "Name",
            read: true,
            write: false,
            def: "",
        };
        await this.createDataPoint(`${id.dp}.TR_064.Presence.${val.mac_object}.name`, common, "state", null);
        common = {
            name: {
                en: "is currently offline",
                de: "ist derzeit offline",
                ru: "в настоящее время офлайн",
                pt: "está offline",
                nl: "is momenteel offline",
                fr: "est actuellement hors ligne",
                it: "è attualmente offline",
                es: "actualmente no está conectado",
                pl: "jest obecnie nieaktywny",
                uk: "в даний час відсутня",
                "zh-cn": "目前已下线",
            },
            type: "number",
            role: "value",
            desc: "is currently offline",
            read: true,
            write: false,
            def: 0,
        };
        await this.createDataPoint(`${id.dp}.TR_064.Presence.${val.mac_object}.currentoffline`, common, "state", null);
        common = {
            name: {
                en: "is currently online",
                de: "ist derzeit online",
                ru: "в настоящее время онлайн",
                pt: "é atualmente online",
                nl: "is momenteel online",
                fr: "est actuellement en ligne",
                it: "è attualmente online",
                es: "actualmente está en línea",
                pl: "jest obecnie online",
                uk: "зараз онлайн",
                "zh-cn": "目前在线",
            },
            type: "number",
            role: "value",
            desc: "is currently online",
            read: true,
            write: false,
            def: 0,
        };
        await this.createDataPoint(`${id.dp}.TR_064.Presence.${val.mac_object}.currentonline`, common, "state", null);
    },
    /**
     * @param {object} id
     */
    async createStateEnergyTR064(id) {
        let common = {};
        common = {
            name: {
                en: "Energy monitor",
                de: "Energiemonitor",
                ru: "Мониторинг энергии",
                pt: "Monitor de energia",
                nl: "Energiemonitor",
                fr: "Surveillance de l'énergie",
                it: "Monitor di energia",
                es: "Energy monitor",
                pl: "Monitor energii",
                uk: "Енергетичний монітор",
                "zh-cn": "能源监测器",
            },
            desc: "Energy monitor",
            icon: "img/tr-064_energy.png",
        };
        await this.createDataPoint(`${id.dp}.TR_064.States.Energy`, common, "folder", null);
        common = {
            name: {
                en: "FRITZ!BOX Overall system - currently",
                de: "FRITZ!BOX Gesamtsystem - aktuell",
                ru: "ФРИЦ! Общая система - в настоящее время",
                pt: "FRITZ! Sistema geral - atualmente",
                nl: "FRITZ!BOX Algemeen systeem - momenteel",
                fr: "FRITZ!BOX Système global - actuellement",
                it: "FRITZ!BOX Sistema complessivo - attualmente",
                es: "FRITZ!BOX Sistema general - actualmente",
                pl: "FRITZ! System ogólny - obecnie",
                uk: "FRITZ!BOX Загальна система - в даний час",
                "zh-cn": "弗利兹! 整个系统 -- -- 目前",
            },
            type: "number",
            role: "value",
            desc: "FRITZ!BOX Overall system - currently",
            read: true,
            write: false,
            unit: "%",
            def: 0,
        };
        await this.createDataPoint(`${id.dp}.TR_064.States.Energy.total_currently`, common, "state", null);
        common = {
            name: {
                en: "FRITZ!BOX Overall system - last 24h",
                de: "FRITZ!BOX Gesamtsystem - letzte 24h",
                ru: "ФРИЦ! Общая система - последняя 24h",
                pt: "FRITZ! Sistema geral - última 24h",
                nl: "FRITZ!BOX Algemeen systeem - laatste 24 uur",
                fr: "FRITZ!BOX Système global - dernières 24h",
                it: "FRITZ!BOX Sistema complessivo - ultimo 24h",
                es: "FRITZ!BOX Sistema general - última 24h",
                pl: "FRITZ! System ogólny - ostatnie 24 godziny",
                uk: "FRITZ!BOX Загальна система - останні 24h",
                "zh-cn": "弗利兹! 整个系统 -- -- 最后24小时",
            },
            type: "number",
            role: "value",
            desc: "FRITZ!BOX Overall system - last 24h",
            read: true,
            write: false,
            unit: "%",
            def: 0,
        };
        await this.createDataPoint(`${id.dp}.TR_064.States.Energy.total_last24h`, common, "state", null);
        common = {
            name: {
                en: "FRITZ!BOX Main processor - currently",
                de: "FRITZ!BOX Hauptprozessor - aktuell",
                ru: "Фритц!BOX Основной процессор - в настоящее время",
                pt: "FRITZ!BOX Processador principal - atualmente",
                nl: "FRITZ!KADER Hoofdprocessor - momenteel",
                fr: "FRITZ!BOITE Processeur principal - actuellement",
                it: "FRITZ!BOX Processore principale - attualmente",
                es: "FRITZ!BOX Procesador principal - actualmente",
                pl: "FRITZ!PUDEŁKO Główny procesor - obecnie",
                uk: "ФРІТЗ!БОКС Основний процесор - в даний час",
                "zh-cn": "弗里兹!图标 主处理器 - 当前",
            },
            type: "number",
            role: "value",
            desc: "FRITZ!BOX Overall system - currently",
            read: true,
            write: false,
            unit: "%",
            def: 0,
        };
        await this.createDataPoint(`${id.dp}.TR_064.States.Energy.main_currently`, common, "state", null);
        common = {
            name: {
                en: "FRITZ!BOX Main processor - last 24h",
                de: "FRITZ!BOX Hauptprozessor - letzte 24h",
                ru: "Фритц!BOX Основной процессор - последний 24h",
                pt: "FRITZ!BOX Processador principal - última 24h",
                nl: "FRITZ!KADER Hoofdprocessor - laatste 24h",
                fr: "FRITZ!BOITE Processeur principal - dernières 24h",
                it: "FRITZ!BOX Processore principale - ultimo 24h",
                es: "FRITZ!BOX Procesador principal - última 24h",
                pl: "FRITZ!PUDEŁKO Główny procesor - ostatnie 24h",
                uk: "ФРІТЗ!БОКС Головний процесор - останні 24h",
                "zh-cn": "弗里兹!图标 主处理器 - 最后24h",
            },
            type: "number",
            role: "value",
            desc: "FRITZ!BOX Main processor - last 24h",
            read: true,
            write: false,
            unit: "%",
            def: 0,
        };
        await this.createDataPoint(`${id.dp}.TR_064.States.Energy.main_last24h`, common, "state", null);
        common = {
            name: {
                en: "FRITZ!BOX WiFi - currently",
                de: "FRITZ!BOX WiFi - aktuell",
                ru: "Фритц!BOX WiFi - в настоящее время",
                pt: "FRITZ!BOX WiFi - atualmente",
                nl: "FRITZ!KADER WiFi - momenteel",
                fr: "FRITZ!BOITE WiFi - actuellement",
                it: "FRITZ!BOX WiFi - attualmente",
                es: "FRITZ!BOX WiFi - actualmente",
                pl: "FRITZ!PUDEŁKO WiFi - obecnie",
                uk: "ФРІТЗ!БОКС Інтернет - в даний час",
                "zh-cn": "弗里兹!图标 WiFi - 当前",
            },
            type: "number",
            role: "value",
            desc: "FRITZ!BOX WiFi - currently",
            read: true,
            write: false,
            unit: "%",
            def: 0,
        };
        await this.createDataPoint(`${id.dp}.TR_064.States.Energy.wifi_currently`, common, "state", null);
        common = {
            name: {
                en: "FRITZ!BOX WiFi - last 24h",
                de: "FRITZ!BOX WiFi - letzte 24h",
                ru: "Фритц!BOX WiFi - последний 24h",
                pt: "FRITZ!BOX WiFi - última 24h",
                nl: "FRITZ!BOX WiFi - laatste 24 uur",
                fr: "FRITZ!BOX WiFi - dernières 24h",
                it: "FRITZ!BOX WiFi - ultimo 24h",
                es: "FRITZ!BOX WiFi - última 24h",
                pl: "FRITZ!BOX WiFi - ostatnie 24 godziny",
                uk: "ФРІТЗ!BOX WiFi - останні 24h",
                "zh-cn": "弗里兹!BOX WiFi - 最后24小时",
            },
            type: "number",
            role: "value",
            desc: "FRITZ!BOX WiFi - last 24h",
            read: true,
            write: false,
            unit: "%",
            def: 0,
        };
        await this.createDataPoint(`${id.dp}.TR_064.States.Energy.wifi_last24h`, common, "state", null);
        common = {
            name: {
                en: "FRITZ!BOX Connection - currently",
                de: "FRITZ!BOX Connection - aktuell",
                ru: "Фритц!BOX Connection - в настоящее время",
                pt: "FRITZ!BOX Conexão - atualmente",
                nl: "FRITZ!BOX-verbinding - momenteel",
                fr: "FRITZ!Connexion BOX - actuellement",
                it: "FRITZ!BOX Connessione - attualmente",
                es: "FRITZ!BOX Connection - actualmente",
                pl: "FRITZ!BOX Connection - aktualnie",
                uk: "ФРІТЗ!Підключення BOX - в даний час",
                "zh-cn": "弗里兹!BOX 连接 - 目前",
            },
            type: "number",
            role: "value",
            desc: "FRITZ!BOX Connection - currently",
            read: true,
            write: false,
            unit: "%",
            def: 0,
        };
        await this.createDataPoint(`${id.dp}.TR_064.States.Energy.conn_currently`, common, "state", null);
        common = {
            name: {
                en: "FRITZ!BOX Connection - last 24h",
                de: "FRITZ!BOX Verbindung - letzte 24h",
                ru: "Фритц!BOX Connection - последний 24h",
                pt: "FRITZ!BOX Conexão - última 24h",
                nl: "FRITZ!BOX-verbinding - laatste 24 uur",
                fr: "FRITZ!Connexion BOX - dernières 24h",
                it: "FRITZ!BOX Connessione - ultima 24h",
                es: "FRITZ!Conexión BOX - última 24h",
                pl: "FRITZ!BOX Connection - ostatnie 24 godziny",
                uk: "ФРІТЗ!Підключення BOX - останні 24h",
                "zh-cn": "弗里兹!BOX 连接 - 最后24小时",
            },
            type: "number",
            role: "value",
            desc: "FRITZ!BOX Connection - last 24h",
            read: true,
            write: false,
            unit: "%",
            def: 0,
        };
        await this.createDataPoint(`${id.dp}.TR_064.States.Energy.conn_last24h`, common, "state", null);
        common = {
            name: {
                en: "FRITZ!BOX Fon connections - currently",
                de: "FRITZ!BOX Fon-Verbindungen - aktuell",
                ru: "Фритц!BOX Fon-соединения - в настоящее время",
                pt: "FRITZ!BOX Conexões Fon - atualmente",
                nl: "FRITZ!KADER Fon verbindingen - momenteel",
                fr: "FRITZ!BOITE Connexions Fon - actuellement",
                it: "FRITZ!BOX Collegamenti Fon - attualmente",
                es: "FRITZ!BOX Conexiones Fon - actualmente",
                pl: "FRITZ!PUDEŁKO Połączenia Fon - obecnie",
                uk: "ФРІТЗ!БОКС З'єднання Fon - в даний час",
                "zh-cn": "弗里兹!图标 Fon 连接 - 目前",
            },
            type: "number",
            role: "value",
            desc: "FRITZ!BOX Fon connections - currently",
            read: true,
            write: false,
            unit: "%",
            def: 0,
        };
        await this.createDataPoint(`${id.dp}.TR_064.States.Energy.fon_currently`, common, "state", null);
        common = {
            name: {
                en: "FRITZ!BOX Fon connections - last 24h",
                de: "FRITZ!BOX Fon-Verbindungen - letzte 24h",
                ru: "Фритц!BOX Fon - последние 24h",
                pt: "FRITZ!BOX Conexões Fon - última 24h",
                nl: "FRITZ!KADER Fon verbindingen - laatste 24 uur",
                fr: "FRITZ!BOITE Connexions Fon - dernières 24h",
                it: "FRITZ!BOX Collegamenti Fon - ultimi 24h",
                es: "FRITZ!BOX conexiones Fon - última 24h",
                pl: "FRITZ!PUDEŁKO Połączenia Fon - ostatnie 24 godziny",
                uk: "ФРІТЗ!БОКС З'єднання Fon - останні 24h",
                "zh-cn": "弗里兹!图标 Fon连接 - 最后24小时",
            },
            type: "number",
            role: "value",
            desc: "FRITZ!BOX Fon-Verbindungen - last 24h",
            read: true,
            write: false,
            unit: "%",
            def: 0,
        };
        await this.createDataPoint(`${id.dp}.TR_064.States.Energy.fon_last24h`, common, "state", null);
        common = {
            name: {
                en: "FRITZ!BOX USB devices - currently",
                de: "FRITZ!BOX USB-Geräte - aktuell",
                ru: "Фритц!USB-устройства BOX - в настоящее время",
                pt: "FRITZ!Dispositivos USB BOX - atualmente",
                nl: "FRITZ!BOX USB-apparaten - momenteel",
                fr: "FRITZ!BOX Appareils USB - actuellement",
                it: "FRITZ!Dispositivi USB BOX - attualmente",
                es: "FRITZ!Dispositivos USB BOX - actualmente",
                pl: "FRITZ!BOX urządzenia USB - obecnie",
                uk: "ФРІТЗ!Пристрої USB BOX - в даний час",
                "zh-cn": "弗里兹!BOX USB 设备 - 目前",
            },
            type: "number",
            role: "value",
            desc: "FRITZ!BOX USB devices - currently",
            read: true,
            write: false,
            unit: "%",
            def: 0,
        };
        await this.createDataPoint(`${id.dp}.TR_064.States.Energy.usb_currently`, common, "state", null);
        common = {
            name: {
                en: "FRITZ!BOX USB devices - last 24h",
                de: "FRITZ!BOX USB-Geräte - letzte 24h",
                ru: "Фритц!USB-устройства BOX - последние 24h",
                pt: "FRITZ!Dispositivos USB BOX - última 24h",
                nl: "FRITZ!BOX USB-apparaten - laatste 24 uur",
                fr: "FRITZ!BOX Appareils USB - dernières 24h",
                it: "FRITZ!Dispositivi USB BOX - ultima 24h",
                es: "FRITZ!Dispositivos USB BOX - última 24h",
                pl: "FRITZ!BOX USB - ostatnie 24 godziny",
                uk: "ФРІТЗ!Пристрої USB BOX - останні 24h",
                "zh-cn": "弗里兹!BOX USB 设备 - 最后24小时",
            },
            type: "number",
            role: "value",
            desc: "FRITZ!BOX USB devices - last 24h",
            read: true,
            write: false,
            unit: "%",
            def: 0,
        };
        await this.createDataPoint(`${id.dp}.TR_064.States.Energy.usb_last24h`, common, "state", null);
        common = {
            name: {
                en: "LAN 1",
                de: "LAN 1",
                ru: "LAN 1",
                pt: "LAN 1",
                nl: "LAN 1",
                fr: "LAN 1",
                it: "LAN 1",
                es: "LAN 1",
                pl: "LAN 1",
                uk: "ЛАН 1",
                "zh-cn": "局域网1",
            },
            type: "boolean",
            role: "state",
            desc: "LAN 1",
            read: true,
            write: false,
            def: false,
        };
        await this.createDataPoint(`${id.dp}.TR_064.States.Energy.lan1`, common, "state", null);
        common = {
            name: {
                en: "LAN 2",
                de: "LAN 2",
                ru: "LAN 2",
                pt: "LAN 2",
                nl: "LAN 2",
                fr: "LAN 2",
                it: "LAN 2",
                es: "LAN 2",
                pl: "LAN 2",
                uk: "ЛАН 2",
                "zh-cn": "局域网2",
            },
            type: "boolean",
            role: "state",
            desc: "LAN 2",
            read: true,
            write: false,
            def: false,
        };
        await this.createDataPoint(`${id.dp}.TR_064.States.Energy.lan2`, common, "state", null);
        common = {
            name: {
                en: "LAN 3",
                de: "LAN 3",
                ru: "LAN 3",
                pt: "LAN 3",
                nl: "LAN 3",
                fr: "LAN 3",
                it: "LAN 3",
                es: "LAN 3",
                pl: "LAN 3",
                uk: "ЛАН 3",
                "zh-cn": "局域网3",
            },
            type: "boolean",
            role: "state",
            desc: "LAN 3",
            read: true,
            write: false,
            def: false,
        };
        await this.createDataPoint(`${id.dp}.TR_064.States.Energy.lan3`, common, "state", null);
        common = {
            name: {
                en: "LAN 4",
                de: "LAN 4",
                ru: "LAN 4",
                pt: "LAN 4",
                nl: "LAN 4",
                fr: "LAN 4",
                it: "LAN 4",
                es: "LAN 4",
                pl: "LAN 4",
                uk: "ЛАН 4",
                "zh-cn": "局域网4",
            },
            type: "boolean",
            role: "state",
            desc: "LAN 4",
            read: true,
            write: false,
            def: false,
        };
        await this.createDataPoint(`${id.dp}.TR_064.States.Energy.lan4`, common, "state", null);
        common = {
            name: {
                en: "WAN",
                de: "WAN",
                ru: "WAN",
                pt: "WAN",
                nl: "WAN",
                fr: "POUR",
                it: "WAN",
                es: "WAN",
                pl: "WAN",
                uk: "ЗАМОВИТИ",
                "zh-cn": "广",
            },
            type: "boolean",
            role: "state",
            desc: "WAN",
            read: true,
            write: false,
            def: false,
        };
        await this.createDataPoint(`${id.dp}.TR_064.States.Energy.wan`, common, "state", null);
        common = {
            name: {
                en: "CPU usage",
                de: "CPU-Nutzung",
                ru: "Использование процессора",
                pt: "Uso de CPU",
                nl: "CPU-gebruik",
                fr: "Utilisation du processeur",
                it: "Utilizzo della CPU",
                es: "Uso de CPU",
                pl: "Wykorzystanie procesora",
                uk: "Використання процесора",
                "zh-cn": "CPU 使用情况",
            },
            type: "string",
            role: "json",
            desc: "CPU usage",
            read: true,
            write: false,
            def: "[]",
        };
        await this.createDataPoint(`${id.dp}.TR_064.States.Energy.cpu_usage`, common, "state", null);
        common = {
            name: {
                en: "Scaling CPU usage",
                de: "Skalierung der CPU-Nutzung",
                ru: "Расширение использования процессора",
                pt: "Uso de CPU em andamento",
                nl: "Schalen van CPU-gebruik",
                fr: "Utilisation des processeurs",
                it: "Ridimensionamento dell'utilizzo della CPU",
                es: "Escala de uso de CPU",
                pl: "Skalowanie wykorzystania procesora",
                uk: "Використання ЦП",
                "zh-cn": "缩放 CPU 使用量",
            },
            type: "string",
            role: "json",
            desc: "Scaling CPU usage",
            read: true,
            write: false,
            def: "[]",
        };
        await this.createDataPoint(`${id.dp}.TR_064.States.Energy.cpu_usage_scale`, common, "state", null);
        common = {
            name: {
                en: "CPU temperature",
                de: "CPU Temperatur",
                ru: "Температура процессора",
                pt: "Temperatura da CPU",
                nl: "CPU temperatuur",
                fr: "Température du processeur",
                it: "Temperatura della CPU",
                es: "Temperatura de CPU",
                pl: "Temperatura procesora",
                uk: "Температура процесора",
                "zh-cn": "CPU 温度",
            },
            type: "string",
            role: "json",
            desc: "CPU temperature",
            read: true,
            write: false,
            def: "[]",
        };
        await this.createDataPoint(`${id.dp}.TR_064.States.Energy.cpu_temperature`, common, "state", null);
        common = {
            name: {
                en: "RAM usage",
                de: "RAM-Nutzung",
                ru: "Использование RAM",
                pt: "Uso de RAM",
                nl: "RAM-gebruik",
                fr: "Utilisation de la RAM",
                it: "Utilizzo della RAM",
                es: "Uso de la memoria",
                pl: "Wykorzystanie pamięci RAM",
                uk: "Використання оперативної пам'яті",
                "zh-cn": "内存使用情况",
            },
            type: "string",
            role: "json",
            desc: "RAM usage",
            read: true,
            write: false,
            def: "[]",
        };
        await this.createDataPoint(`${id.dp}.TR_064.States.Energy.ram_usage`, common, "state", null);
        common = {
            name: {
                en: "Scaling RAM usage",
                de: "Skalierung der RAM-Nutzung",
                ru: "Расширение использования RAM",
                pt: "Uso de RAM em andamento",
                nl: "Gebruik van RAM schalen",
                fr: "Utilisation de la RAM",
                it: "Ridimensionamento dell'utilizzo della RAM",
                es: "Escalar el uso de RAM",
                pl: "Skalowanie wykorzystania pamięci RAM",
                uk: "Налаштування використання оперативної пам'яті",
                "zh-cn": "放大内存使用",
            },
            type: "string",
            role: "json",
            desc: "Scaling RAM usage",
            read: true,
            write: false,
            def: "[]",
        };
        await this.createDataPoint(`${id.dp}.TR_064.States.Energy.ram_usage_scale`, common, "state", null);
    },
    /**
     * @param {object} id
     */
    async createStateTR064(id) {
        let common = {};
        common = {
            name: {
                en: "States",
                de: "Zustände",
                ru: "государство",
                pt: "estado",
                nl: "toestand",
                fr: "état",
                it: "stato",
                es: "estado",
                pl: "stan",
                uk: "стан",
                "zh-cn": "状态",
            },
            desc: "States",
            icon: "img/states.png",
        };
        await this.createDataPoint(`${id.dp}.TR_064.States`, common, "folder", null);
        common = {
            name: {
                en: "WAN monitoring",
                de: "WAN Überwachung",
                ru: "WAN monitoring",
                pt: "Acompanhamento da Organização",
                nl: "WAN-monitoring",
                fr: "Surveillance du RE",
                it: "Monitoraggio WAN",
                es: "WAN monitoring",
                pl: "Monitorowanie WAN",
                uk: "Моніторинг мережі",
                "zh-cn": "广域监测",
            },
            desc: "WAN monitoring",
            icon: "img/megabyte.png",
        };
        await this.createDataPoint(`${id.dp}.TR_064.States.Traffic`, common, "folder", null);
        common = {
            name: {
                en: "Online monitoring values",
                de: "Online-Überwachungswerte",
                ru: "Ценности онлайнового мониторинга",
                pt: "Valores de monitoramento on-line",
                nl: "Online-monitoringwaarden",
                fr: "Valeurs de surveillance en ligne",
                it: "Valori di monitoraggio online",
                es: "Valores de vigilancia en línea",
                pl: "Wartości monitorowania online",
                uk: "Значення онлайн моніторингу",
                "zh-cn": "在线监测值",
            },
            type: "string",
            role: "json",
            desc: "Online monitoring values",
            read: true,
            write: false,
            def: "",
        };
        await this.createDataPoint(`${id.dp}.TR_064.States.Traffic.fritz_monitor`, common, "state", null);
        common = {
            name: {
                en: "Online monitoring values as array",
                de: "Online-Überwachungswerte als Array",
                ru: "Онлайн мониторинг значения как массив",
                pt: "Valores de monitoramento on-line como array",
                nl: "Online monitoringwaarden als array",
                fr: "Valeurs de surveillance en ligne comme tableau",
                it: "Valori di monitoraggio online come array",
                es: "Valores de monitoreo en línea como matriz",
                pl: "Wartości monitorowania online jako tablica",
                uk: "Значення онлайн моніторингу як масив",
                "zh-cn": "作为数组的在线监测值",
            },
            type: "string",
            role: "json",
            desc: "Online monitoring values as array",
            read: true,
            write: false,
            def: "",
        };
        await this.createDataPoint(`${id.dp}.TR_064.States.Traffic.fritz_monitor_array`, common, "state", null);
        common = {
            name: {
                en: "Update online monitoring values",
                de: "Online-Überwachungswerte aktualisieren",
                ru: "Обновление онлайновых значений мониторинга",
                pt: "Atualizar valores de monitoramento on-line",
                nl: "Online monitoringwaarden bijwerken",
                fr: "Mettre à jour les valeurs de surveillance en ligne",
                it: "Aggiorna i valori di monitoraggio online",
                es: "Actualizar los valores de monitoreo en línea",
                pl: "Aktualizacja wartości monitorowania online",
                uk: "Оновлення значень онлайн моніторингу",
                "zh-cn": "更新在线监测值",
            },
            type: "boolean",
            role: "button",
            desc: "Update online monitoring values",
            read: false,
            write: false,
            def: false,
        };
        await this.createDataPoint(`${id.dp}.TR_064.States.Traffic.fritz_monitor_update`, common, "state", false);
        common = {
            name: {
                en: "Access type",
                de: "Zugang",
                ru: "Тип доступа",
                pt: "Tipo de acesso",
                nl: "Type toegang",
                fr: "Type d'accès",
                it: "Tipo di accesso",
                es: "Tipo de acceso",
                pl: "Typ dostępu",
                uk: "Тип доступу",
                "zh-cn": "访问类型",
            },
            type: "string",
            role: "state",
            desc: "Access type",
            read: true,
            write: false,
            def: "",
            states: {
                unknown: "Unknown",
                DSL: "DSL connected",
                Ethernet: "Ethernet connected",
                "X_AVM-DE_Fiber": "Fiber",
                "X_AVM-DE_UMTS": "UMTS",
                "X_AVM-DE_Cable": "Cable",
                "X_AVM-DE_LTE": "LTE",
            },
        };
        await this.createDataPoint(`${id.dp}.TR_064.States.Traffic.accesstype`, common, "state", "");
        common = {
            name: {
                en: "Name of sync group",
                de: "Name der Sync-Gruppe",
                ru: "Название группы синхронизации",
                pt: "Nome do grupo de sincronização",
                nl: "Naam van synchronisatiegroep",
                fr: "Nom du groupe de synchronisation",
                it: "Nome del gruppo di sincronizzazione",
                es: "Nombre del grupo de sincronización",
                pl: "Nazwa grupy synchronizacji",
                uk: "Назва групи синхронізації",
                "zh-cn": "同步组名称",
            },
            type: "string",
            role: "state",
            desc: "Name of sync group",
            read: true,
            write: false,
            def: "",
        };
        await this.createDataPoint(`${id.dp}.TR_064.States.Traffic.groupmode`, common, "state", "");
        common = {
            name: {
                en: "Upload speed",
                de: "Ladegeschwindigkeit",
                ru: "Скорость загрузки",
                pt: "Velocidade de upload",
                nl: "Uploadsnelheid",
                fr: "Vitesse de chargement",
                it: "Velocità di carico",
                es: "Velocidad de carga",
                pl: "Prędkość wysyłania",
                uk: "Швидкість завантаження",
                "zh-cn": "上传速度",
            },
            type: "number",
            role: "value",
            desc: "Upload speed",
            read: true,
            write: false,
            unit: "Mbit/s",
            def: 0,
        };
        await this.createDataPoint(`${id.dp}.TR_064.States.Traffic.upload`, common, "state", 0);
        common = {
            name: {
                en: "Download speed",
                de: "Geschwindigkeit herunterladen",
                ru: "Скорость загрузки",
                pt: "Velocidade de download",
                nl: "Downloadsnelheid",
                fr: "Vitesse de téléchargement",
                it: "Scarica la velocità",
                es: "Descargar velocidad",
                pl: "Prędkość pobierania",
                uk: "Швидкість завантаження",
                "zh-cn": "下载速度",
            },
            type: "number",
            role: "value",
            desc: "Upload speed",
            read: true,
            write: false,
            unit: "Mbit/s",
            def: 0,
        };
        await this.createDataPoint(`${id.dp}.TR_064.States.Traffic.download`, common, "state", 0);
        common = {
            name: {
                en: "Get total byte sent",
                de: "Gesamt Byte gesendet",
                ru: "Получить полный байт",
                pt: "Obter total byte enviado",
                nl: "Krijg totale byte verzonden",
                fr: "Obtenir l'octet total envoyé",
                it: "Ottenere byte totale inviato",
                es: "Obtener byte total enviado",
                pl: "Get total byte send",
                uk: "Отримувати відправлення",
                "zh-cn": "获取发送的总字节",
            },
            type: "number",
            role: "value",
            desc: "Get total byte sent",
            read: true,
            write: false,
            unit: "MB",
            def: 0,
        };
        await this.createDataPoint(`${id.dp}.TR_064.States.Traffic.gettotalByteSent`, common, "state", 0);
        common = {
            name: {
                en: "Get total byte receive",
                de: "Insgesamt erhalten Byte",
                ru: "Получить полный байт",
                pt: "Obter total byte receber",
                nl: "Ontvang totale byte ontvangen",
                fr: "Obtenez le total des octets reçus",
                it: "Ottenere totale byte ricevere",
                es: "Obtener total byte recibir",
                pl: "Get total byte receive",
                uk: "Отримай повну суму",
                "zh-cn": "获得总字节接收",
            },
            type: "number",
            role: "value",
            desc: "Get total byte receive",
            read: true,
            write: false,
            unit: "MB",
            def: 0,
        };
        await this.createDataPoint(`${id.dp}.TR_064.States.Traffic.gettotalByteReceive`, common, "state", 0);
        common = {
            name: {
                en: "Get total packets sent",
                de: "Gesamtpakete erhalten",
                ru: "Получить полные пакеты отправлены",
                pt: "Obter pacotes totais enviados",
                nl: "Totaal pakketjes ontvangen",
                fr: "Obtenir le total des paquets envoyés",
                it: "Ottieni pacchetti totali inviati",
                es: "Obtener paquetes totales enviados",
                pl: "Pobierz wszystkie pakiety wysłane",
                uk: "Отримай загальний пакет",
                "zh-cn": "获取发送的全部数据包",
            },
            type: "number",
            role: "value",
            desc: "Get total packets sent",
            read: true,
            write: false,
            unit: "MB",
            def: 0,
        };
        await this.createDataPoint(`${id.dp}.TR_064.States.Traffic.gettotalPacketsSent`, common, "state", 0);
        common = {
            name: {
                en: "Get total packets receive",
                de: "Gesamtpakete erhalten",
                ru: "Получить полные пакеты",
                pt: "Obter pacotes totais receber",
                nl: "Totaal pakket ontvangen",
                fr: "Obtenez le total des paquets reçus",
                it: "Ottenere pacchetti totali ricevere",
                es: "Recibir paquetes totales",
                pl: "Uzyskaj całkowitą ilość pakietów",
                uk: "Отримати загальну кількість пакетів",
                "zh-cn": "得到全部数据包",
            },
            type: "number",
            role: "value",
            desc: "Get total packets receive",
            read: true,
            write: false,
            unit: "MB",
            def: 0,
        };
        await this.createDataPoint(`${id.dp}.TR_064.States.Traffic.gettotalPacketsReceive`, common, "state", 0);
        common = {
            name: {
                en: "Current number of bytes per second in downstream direction of multicast traffic",
                de: "Aktuelle Anzahl von Bytes pro Sekunde in nachgeschalteter Richtung des Multicast-Verkehrs",
                ru: "Нынешнее количество байтов в секунду в направлении потока многоадресного трафика",
                pt: "Número atual de bytes por segundo na direção a jusante do tráfego multicast",
                nl: "Huidig aantal bytes per seconde in stroomafwaartse richting van multicastverkeer",
                fr: "Nombre actuel d'octets par seconde dans la direction aval du trafic multicast",
                it: "Numero attuale di byte al secondo in direzione a valle del traffico multicast",
                es: "Número actual de bytes por segundo en dirección aguas abajo del tráfico multicast",
                pl: "Obecna liczba bajtów na sekundę w kierunku dolnym ruchu wielonarodowego",
                uk: "Поточна кількість байтів за секунду у напрямку руху мультикастів",
                "zh-cn": "目前多广播流量下游方向每秒字节数",
            },
            type: "string",
            role: "state",
            desc: "newds_current_bps",
            read: true,
            write: false,
            unit: "bps",
            def: "[]",
        };
        await this.createDataPoint(`${id.dp}.TR_064.States.Traffic.newds_current_bps`, common, "state", null);
        common = {
            name: {
                en: "Current number of bytes per second in downstream direction of home, guest and multicast traffic",
                de: "Aktuelle Anzahl von Bytes pro Sekunde in stromabwärts Richtung zu Hause, Gast und Multicast-Verkehr",
                ru: "Текущее количество байтов в секунду в направлении вниз по направлению дома, гостевого и многоадресного трафика",
                pt: "Número atual de bytes por segundo na direção a jusante de tráfego doméstico, convidado e multicast",
                nl: "Huidig aantal bytes per seconde in stroomafwaartse richting van thuis, gast en multicast verkeer",
                fr: "Nombre actuel d'octets par seconde dans la direction en aval du trafic domestique, invité et multicast",
                it: "Numero attuale di byte al secondo in direzione a valle del traffico domestico, ospite e multicast",
                es: "Número actual de bytes por segundo en dirección descendente del tráfico doméstico, invitado y multicast",
                pl: "Bieżąca liczba bajtów na sekundę w kierunku dolnym do domu, dla gości i w ruchu wielonarodowym",
                uk: "Поточна кількість байтів за секунду в напрямку внизу будинку, гостьовий і багатокатний трафік",
                "zh-cn": "目前家用、客用和多播交通下游方向每秒字节数",
            },
            type: "string",
            role: "state",
            desc: "newmc_current_bps",
            read: true,
            write: false,
            unit: "bps",
            def: "[]",
        };
        await this.createDataPoint(`${id.dp}.TR_064.States.Traffic.newmc_current_bps`, common, "state", null);
        common = {
            name: {
                en: "Current number of bytes per second in upstream direction",
                de: "Aktuelle Anzahl von Bytes pro Sekunde in Vorwärtsrichtung",
                ru: "Текущее количество байтов в секунду в направлении вверх по течению",
                pt: "Número atual de bytes por segundo na direção a montante",
                nl: "Huidig aantal bytes per seconde in stroomopwaarts",
                fr: "Nombre actuel d'octets par seconde en direction amont",
                it: "Numero attuale di byte al secondo in direzione a monte",
                es: "Número actual de bytes por segundo en dirección aguas arriba",
                pl: "Bieżąca liczba bajtów na sekundę w kierunku zewnętrznym",
                uk: "Поточна кількість байтів за секунду в напрямку до потоку",
                "zh-cn": "上游方向当前每秒字节数",
            },
            type: "string",
            role: "state",
            desc: "newus_current_bps",
            read: true,
            write: false,
            unit: "bps",
            def: "[]",
        };
        await this.createDataPoint(`${id.dp}.TR_064.States.Traffic.newus_current_bps`, common, "state", null);
        common = {
            name: {
                en: "Current number of bytes per second in upstream direction of real-time home traffic",
                de: "Aktuelle Anzahl von Bytes pro Sekunde in Vorwärtsrichtung des Echtzeit-Home-Verkehrs",
                ru: "Текущее количество байтов в секунду в направлении вверх по течению домашнего трафика в реальном времени",
                pt: "Número atual de bytes por segundo na direção a montante do tráfego doméstico em tempo real",
                nl: "Huidig aantal bytes per seconde in stroomopwaarts richting real-time thuisverkeer",
                fr: "Nombre actuel d'octets par seconde dans la direction amont du trafic domestique en temps réel",
                it: "Numero attuale di byte al secondo in direzione a monte del traffico domestico in tempo reale",
                es: "Número actual de bytes por segundo en dirección aguas arriba del tráfico doméstico en tiempo real",
                pl: "Bieżąca liczba bajtów na sekundę w kierunku ruchu drogowego w czasie rzeczywistym",
                uk: "Поточна кількість байтів за секунду в напрямку до руху в режимі реального часу",
                "zh-cn": "目前实时家庭交通上游方向每秒字节数",
            },
            type: "string",
            role: "state",
            desc: "newprio_realtime_bps",
            read: true,
            write: false,
            unit: "bps",
            def: "[]",
        };
        await this.createDataPoint(`${id.dp}.TR_064.States.Traffic.newprio_realtime_bps`, common, "state", null);
        common = {
            name: {
                en: "Current number of bytes per second in upstream direction of important home traffic",
                de: "Aktuelle Anzahl von Bytes pro Sekunde in stromaufwärts Richtung des wichtigen Heimverkehrs",
                ru: "Текущее количество байтов в секунду в направлении вверх по течению важного домашнего трафика",
                pt: "Número atual de bytes por segundo na direção a montante do tráfego doméstico importante",
                nl: "Huidig aantal bytes per seconde in stroomopwaarts richting belangrijk thuisverkeer",
                fr: "Nombre actuel d'octets par seconde dans la direction amont d'un important trafic domestique",
                it: "Numero attuale di byte al secondo in direzione a monte del traffico domestico importante",
                es: "Número actual de bytes por segundo en dirección aguas arriba de tráfico casero importante",
                pl: "Bieżąca liczba bajtów na sekundę w kierunku wyższego szczebla ważnego ruchu domowego",
                uk: "Поточна кількість байтів за секунду в напрямку до потоку важливого домашнього трафіку",
                "zh-cn": "目前重要家用交通上游方向每秒字节数",
            },
            type: "string",
            role: "state",
            desc: "newprio_high_bps",
            read: true,
            write: false,
            unit: "bps",
            def: "[]",
        };
        await this.createDataPoint(`${id.dp}.TR_064.States.Traffic.newprio_high_bps`, common, "state", null);
        common = {
            name: {
                en: "Current number of bytes per second in upstream direction of default home traffic",
                de: "Aktuelle Anzahl von Bytes pro Sekunde in Vorwärtsrichtung des Standard-Home-Verkehrs",
                ru: "Нынешнее количество байтов в секунду в направлении вверх по течению от обычного домашнего трафика",
                pt: "Número atual de bytes por segundo na direção de upstream do tráfego doméstico padrão",
                nl: "Huidig aantal bytes per seconde in stroomopwaarts richting standaard thuisverkeer",
                fr: "Nombre actuel d'octets par seconde dans la direction amont du trafic intérieur par défaut",
                it: "Numero attuale di byte al secondo in direzione a monte del traffico domestico predefinito",
                es: "Número actual de bytes por segundo en dirección aguas arriba del tráfico doméstico predeterminado",
                pl: "Bieżąca liczba bajtów na sekundę w kierunku górnym domyślnego ruchu domowego",
                uk: "Поточна кількість байтів за секунду у напрямку до потоку за замовчуванням",
                "zh-cn": "目前默认家庭交通上游方向每秒字节数",
            },
            type: "string",
            role: "state",
            desc: "newprio_default_bps",
            read: true,
            write: false,
            unit: "bps",
            def: "[]",
        };
        await this.createDataPoint(`${id.dp}.TR_064.States.Traffic.newprio_default_bps`, common, "state", null);
        common = {
            name: {
                en: "Current number of bytes per second in upstream direction of background home traffic",
                de: "Aktuelle Anzahl von Bytes pro Sekunde in Vorwärtsrichtung des heimischen Hintergrunds",
                ru: "Нынешнее количество байтов в секунду в направлении вверх по течению фонового домашнего трафика",
                pt: "Número atual de bytes por segundo na direção a montante do tráfego doméstico de fundo",
                nl: "Huidig aantal bytes per seconde in stroomopwaarts richting van het thuisverkeer",
                fr: "Nombre actuel d'octets par seconde dans la direction amont du trafic intérieur de fond",
                it: "Numero attuale di byte al secondo in direzione a monte del traffico domestico di fondo",
                es: "Número actual de bytes por segundo en dirección aguas arriba del tráfico doméstico de fondo",
                pl: "Bieżąca liczba bajtów na sekundę w kierunku początkowym ruchu w tle",
                uk: "Поточна кількість байтів за секунду у напрямку до потоку фонового руху",
                "zh-cn": "在背景家庭交通的上游方向,目前每秒字节数",
            },
            type: "string",
            role: "state",
            desc: "newprio_low_bps",
            read: true,
            write: false,
            unit: "bps",
            def: "[]",
        };
        await this.createDataPoint(`${id.dp}.TR_064.States.Traffic.newprio_low_bps`, common, "state", null);
        common = {
            name: {
                en: "Firmware",
                de: "Firmware",
                ru: "Фирма",
                pt: "Firmware",
                nl: "Firmware",
                fr: "Firmware",
                it: "Firmware",
                es: "Firmware",
                pl: "Oprogramowanie",
                uk: "Прошивка",
                "zh-cn": "固件",
            },
            type: "string",
            role: "info.firmware",
            desc: "Firmware",
            read: true,
            write: false,
            def: "",
        };
        await this.createDataPoint(`${id.dp}.TR_064.States.firmware`, common, "state", "");
        common = {
            name: {
                en: "Hardware",
                de: "Hardware",
                ru: "Оборудование",
                pt: "Hardware",
                nl: "Hardheid",
                fr: "Matériel",
                it: "Hardware",
                es: "Hardware",
                pl: "Sprzęt",
                uk: "Обладнання",
                "zh-cn": "硬件",
            },
            type: "string",
            role: "info.hardware",
            desc: "Hardware",
            read: true,
            write: false,
            def: "",
        };
        await this.createDataPoint(`${id.dp}.TR_064.States.hardware`, common, "state", "");
        common = {
            name: {
                en: "Serialnumber",
                de: "Seriennummer",
                ru: "Серийный номер",
                pt: "Número de série",
                nl: "Volgnummer",
                fr: "Numéro de série",
                it: "Numero di serie",
                es: "Número de serie",
                pl: "Numer seryjny",
                uk: "Серійно-цифровий",
                "zh-cn": "序列号",
            },
            type: "string",
            role: "info.serial",
            desc: "Serialnumber",
            read: true,
            write: false,
            def: "",
        };
        await this.createDataPoint(`${id.dp}.TR_064.States.serialnumber`, common, "state", "");
        common = {
            name: {
                en: "Protocol",
                de: "Protokoll",
                ru: "Протокол",
                pt: "Protocolo",
                nl: "Protocol",
                fr: "Protocole",
                it: "Protocollo",
                es: "Protocolo",
                pl: "Protokół",
                uk: "Протоколи",
                "zh-cn": "议定书",
            },
            type: "string",
            role: "info",
            desc: "Protocol",
            read: true,
            write: false,
            def: "",
        };
        await this.createDataPoint(`${id.dp}.TR_064.States.protocol`, common, "state", "");
        common = {
            name: {
                en: "Online since",
                de: "Online seit",
                ru: "Онлайн",
                pt: "Online desde",
                nl: "Online sinds",
                fr: "En ligne depuis",
                it: "Online da",
                es: "En línea desde",
                pl: "Online od",
                uk: "Інтернет з",
                "zh-cn": "在线",
            },
            type: "number",
            role: "info",
            desc: "Online since",
            read: true,
            write: false,
            def: 0,
        };
        await this.createDataPoint(`${id.dp}.TR_064.States.uptime`, common, "state", 0);
        common = {
            name: {
                en: "SSL Port",
                de: "SSL Port",
                ru: "SSL-порт",
                pt: "Porta SSL",
                nl: "SSL-poort",
                fr: "Port SSL",
                it: "Porto SSL",
                es: "SSL Port",
                pl: "Port SSL",
                uk: "Статус на сервери",
                "zh-cn": "SSL 端口",
            },
            type: "number",
            role: "info.port",
            desc: "SSL Port",
            read: true,
            write: false,
            def: 0,
        };
        await this.createDataPoint(`${id.dp}.TR_064.States.sslport`, common, "state", 0);
        common = {
            name: {
                en: "Rights",
                de: "Rechte",
                ru: "Права человека",
                pt: "Direitos",
                nl: "Rechten",
                fr: "Droits",
                it: "Diritti",
                es: "Derechos",
                pl: "Prawa",
                uk: "Права",
                "zh-cn": "权利",
            },
            type: "string",
            role: "json",
            desc: "SSL Port",
            read: true,
            write: false,
            def: "",
        };
        await this.createDataPoint(`${id.dp}.TR_064.States.rights`, common, "state", "");
        common = {
            name: {
                en: "Send command",
                de: "Befehl senden",
                ru: "Отправить",
                pt: "Enviar comando",
                nl: "Opdracht verzenden",
                fr: "Envoyer la commande",
                it: "Invia comando",
                es: "Enviar comando",
                pl: "Wyślij polecenie",
                uk: "Надіслати команду",
                "zh-cn": "发送命令",
            },
            type: "string",
            role: "state",
            desc: "Send command",
            read: true,
            write: true,
            def: "",
        };
        await this.createDataPoint(`${id.dp}.TR_064.States.sendCommand`, common, "state", "");
        common = {
            name: {
                en: "Read HTTP",
                de: "Lesen Sie HTTP",
                ru: "HTTP",
                pt: "Leia HTTP",
                nl: "HTTP lezen",
                fr: "Lire HTTP",
                it: "Leggi HTTP",
                es: "Lea HTTP",
                pl: "Czytaj HTTP",
                uk: "Читати HTTP",
                "zh-cn": "读取 HTTP",
            },
            type: "string",
            role: "state",
            desc: "Read HTTP",
            read: true,
            write: true,
            def: "",
            states: {
                log: "Logs - JSON",
                telDev: "Phone devices",
                numLi: "Phone numbers",
                phoneline: "Phone line settings",
                sipQual: "Line quality",
                dectMoni: "DECT monitor",
                dectMoniEx: "DECT monitor",
                netDev: "Network connections",
                netSet: "Network settings",
                netMoni: "Network monitor",
                wGuest: "WiFi guest",
                kidPro: "Access profiles",
                kidLis: "Parental controls",
                dslOv: "DSL overview",
                dslStat: "DSL states",
                dslGraph: "DSL graph data",
                dslSpectrum: "DSL spectrum",
                energy: "Energy",
                ecoStat: "ECO states",
                usbOv: "USB devices overview",
                usbMode: "USB settings",
                usbRemo: "USB remote",
                mServSet: "Media settings",
                rdio: "Radion",
                pod: "Podcast",
                homeNet: "Mesh overview",
                meshSet: "Mesh settings",
                contentBox: "Overview",
            },
        };
        await this.createDataPoint(`${id.dp}.TR_064.States.sendHTTPRequest`, common, "state", "");
        common = {
            name: {
                en: "Response HTTP request",
                de: "Antwort HTTP-Anfrage",
                ru: "Ответ HTTP запрос",
                pt: "Pedido HTTP de resposta",
                nl: "Antwoord HTTP-verzoek",
                fr: "Réponse à la requête HTTP",
                it: "Risposta richiesta HTTP",
                es: "Solicitud de respuesta HTTP",
                pl: "Żądanie odpowiedzi HTTP",
                uk: "Відповідь HTTP запит",
                "zh-cn": "响应 HTTP 请求",
            },
            type: "string",
            role: "state",
            desc: "Response HTTP request",
            read: true,
            write: false,
            def: "",
        };
        await this.createDataPoint(`${id.dp}.TR_064.States.sendHTTPResponse`, common, "state", "");
        common = {
            name: {
                en: "WiFi 2.4 GHz",
                de: "WLAN 2,4 GHz",
                ru: "WiFi 2,4 ГГц",
                pt: "WiFi 2.4 GHz",
                nl: "WiFi 2.4 GHz",
                fr: "WiFi 2,4 GHz",
                it: "WiFi 2.4 GHz",
                es: "WiFi 2.4 GHz",
                pl: "WiFi 2.4 GHz",
                uk: "WiFi 2.4 ГГц",
                "zh-cn": "WiFi 2.4千兆赫",
            },
            type: "boolean",
            role: "switch",
            desc: "WiFi 2.4 GHz",
            read: true,
            write: true,
            def: false,
        };
        await this.createDataPoint(`${id.dp}.TR_064.States.wlan24`, common, "state", null);
        common = {
            name: {
                en: "Set new Wifi 2.4 GHz password",
                de: "Neues Wifi 2.4 GHz Passwort setzen",
                ru: "Установить новый пароль Wifi 2.4 ГГц",
                pt: "Definir nova senha Wifi 2.4 GHz",
                nl: "Nieuw Wifi 2.4 GHz-wachtwoord instellen",
                fr: "Définir un nouveau mot de passe Wifi 2.4 GHz",
                it: "Impostare la nuova password Wifi 2.4 GHz",
                es: "Establecer nueva contraseña Wifi 2.4 GHz",
                pl: "Ustaw nowe hasło Wifi 2.4 GHz",
                uk: "Встановіть новий Wifi 2.4 GHz пароль",
                "zh-cn": "设置新的 Wifi 2.4 GHz 密码",
            },
            type: "string",
            role: "state",
            desc: "Set new Wifi 2.4 GHz password",
            read: true,
            write: true,
            def: "",
        };
        await this.createDataPoint(`${id.dp}.TR_064.States.wlan24PW`, common, "state", null);
        common = {
            name: {
                en: "Set new Wifi 2.4 GHz name",
                de: "Neue Wifi 2.4 GHz Namen setzen",
                ru: "Установить новое имя Wifi 2.4 ГГц",
                pt: "Definir novo nome Wifi 2.4 GHz",
                nl: "Nieuwe Wifi 2.4 GHz-naam instellen",
                fr: "Définir un nouveau nom Wifi 2.4 GHz",
                it: "Impostare il nuovo nome Wifi 2.4 GHz",
                es: "Establecer nuevo nombre Wifi 2.4 GHz",
                pl: "Ustaw nową nazwę Wifi 2.4 GHz",
                uk: "Налаштувати новий Wifi 2.4 ГГц",
                "zh-cn": "设置新的 Wifi 2.4 GHz 名称",
            },
            type: "string",
            role: "state",
            desc: "Set new Wifi 2.4 GHz name",
            read: true,
            write: true,
            def: "",
        };
        await this.createDataPoint(`${id.dp}.TR_064.States.wlan24name`, common, "state", null);
        common = {
            name: {
                en: "Wifi 2.4 QRCode",
                de: "Wifi 2.4 QRCode",
                ru: "Wifi 2.4 QRCode",
                pt: "Wifi 2.4 QRCode",
                nl: "Wifi 2.4 QRCode",
                fr: "Wifi 2.4 QRCode",
                it: "Wifi 2.4 QRCode",
                es: "Wifi 2.4 QRCode",
                pl: "Wifi 2.4 QRCode",
                uk: "English, Українська, Français..",
                "zh-cn": "Wifi 2.4 QRCode 软件",
            },
            type: "string",
            role: "state",
            desc: "Wifi 2.4 QRCode",
            read: true,
            write: false,
            def: "",
        };
        await this.createDataPoint(`${id.dp}.TR_064.States.wlan24QRCode`, common, "state", null);
        common = {
            name: {
                en: "WiFi 5 GHz",
                de: "WLAN 5 GHz",
                ru: "WiFi 5 ГГц",
                pt: "WiFi 5 GHz",
                nl: "WiFi 5 GHz",
                fr: "WiFi 5 GHz",
                it: "WiFi 5 GHz",
                es: "WiFi 5 GHz",
                pl: "WiFi 5 GHz",
                uk: "WiFi 5 ГГц",
                "zh-cn": "WiFi 5千兆赫",
            },
            type: "boolean",
            role: "switch",
            desc: "WiFi 5 GHz",
            read: true,
            write: true,
            def: false,
        };
        await this.createDataPoint(`${id.dp}.TR_064.States.wlan50`, common, "state", null);
        common = {
            name: {
                en: "Set new Wifi 5.0 GHz password",
                de: "Neues Wifi 5.0 GHz Passwort setzen",
                ru: "Набрать новый пароль Wifi 5.0 ГГц",
                pt: "Definir nova senha Wifi 5.0 GHz",
                nl: "Nieuw Wifi 5.0 GHz-wachtwoord instellen",
                fr: "Définir un nouveau mot de passe Wifi 5.0 GHz",
                it: "Impostare la nuova password Wifi 5.0 GHz",
                es: "Establecer nueva contraseña Wifi 5.0 GHz",
                pl: "Ustaw nowe hasło Wifi 5.0 GHz",
                uk: "Встановіть новий пароль Wifi 5.0 GHz",
                "zh-cn": "设置新的 Wifi 5.0 GHz 密码",
            },
            type: "string",
            role: "state",
            desc: "Set new Wifi 5 GHz password",
            read: true,
            write: true,
            def: "",
        };
        await this.createDataPoint(`${id.dp}.TR_064.States.wlan50PW`, common, "state", null);
        common = {
            name: {
                en: "Set new Wifi 5.0 GHz name",
                de: "Neue Wifi 5.0 GHz Namen setzen",
                ru: "Установить новое имя Wifi 5.0 ГГц",
                pt: "Definir novo nome Wifi 5.0 GHz",
                nl: "Nieuwe Wifi 5.0 GHz-naam instellen",
                fr: "Définir un nouveau nom Wifi 5.0 GHz",
                it: "Impostare il nuovo nome Wifi 5.0 GHz",
                es: "Nuevo nombre Wifi 5.0 GHz",
                pl: "Ustaw nową nazwę Wifi 5.0 GHz",
                uk: "Встановіть новий Wifi 5.0 GHz",
                "zh-cn": "设置新的 Wifi 5.0 GHz 名称",
            },
            type: "string",
            role: "state",
            desc: "Set new Wifi 5.0 GHz name",
            read: true,
            write: true,
            def: "",
        };
        await this.createDataPoint(`${id.dp}.TR_064.States.wlan50name`, common, "state", null);
        common = {
            name: {
                en: "Wifi 5.0 QRCode",
                de: "Wifi 5.0 QRCode",
                ru: "Wifi 5.0 QRCode",
                pt: "Wifi 5.0 QRCode",
                nl: "Wifi 5.0 QRCode",
                fr: "Wifi 5.0 QRCode",
                it: "Wifi 5.0 QRCode",
                es: "Wifi 5.0 QRCode",
                pl: "Wifi 5.0 QRCode",
                uk: "Wifi 5.0 QRCode",
                "zh-cn": "维菲 5.0 QRCode",
            },
            type: "string",
            role: "state",
            desc: "Wifi 5.0 QRCode",
            read: true,
            write: false,
            def: "",
        };
        await this.createDataPoint(`${id.dp}.TR_064.States.wlan50QRCode`, common, "state", null);
        common = {
            name: {
                en: "WiFi guest access",
                de: "WLAN-Gastzugang",
                ru: "Доступ к Wi-Fi",
                pt: "Acesso Wi-Fi",
                nl: "WiFi gasten toegang",
                fr: "Accès WiFi",
                it: "Accesso WiFi",
                es: "Acceso de huéspedes WiFi",
                pl: "WiFi dla gości",
                uk: "Доступ до Wi-Fi",
                "zh-cn": "无线客机接入",
            },
            type: "boolean",
            role: "switch",
            desc: "WiFi guest access",
            read: true,
            write: true,
            def: false,
        };
        await this.createDataPoint(`${id.dp}.TR_064.States.wlanguest`, common, "state", null);
        common = {
            name: {
                en: "Set new Wifi guest password",
                de: "Neues Wifi Gäste-Passwort eingeben",
                ru: "Установить новый гостевой пароль Wifi",
                pt: "Definir nova senha Wifi",
                nl: "Nieuw Wifi-gastwachtwoord instellen",
                fr: "Définir un nouveau mot de passe invité Wifi",
                it: "Impostare la nuova password degli ospiti Wifi",
                es: "Establecer nueva contraseña de invitados Wifi",
                pl: "Ustaw nowe hasło gości Wifi",
                uk: "Встановити новий пароль гостя Wifi",
                "zh-cn": "设置新的 Wifi 客人密码",
            },
            type: "string",
            role: "state",
            desc: "Set new Wifi guest password",
            read: true,
            write: true,
            def: "",
        };
        await this.createDataPoint(`${id.dp}.TR_064.States.wlanGuestPW`, common, "state", null);
        common = {
            name: {
                en: "WiFi name from guest access",
                de: "WiFi-Name der Gäste",
                ru: "Имя WiFi от гостевого доступа",
                pt: "Nome WiFi do acesso aos hóspedes",
                nl: "WiFi naam van gasten toegang",
                fr: "Nom WiFi depuis l'accès invité",
                it: "WiFi nome dall'accesso degli ospiti",
                es: "Nombre WiFi desde el acceso de los huéspedes",
                pl: "Nazwa WiFi z dostępu dla gości",
                uk: "Назва інтернету від гостя",
                "zh-cn": "来宾访问的 WiFi 名称",
            },
            type: "string",
            role: "state",
            desc: "WiFi name from guest access",
            read: true,
            write: true,
            def: "",
        };
        await this.createDataPoint(`${id.dp}.TR_064.States.wlanguestname`, common, "state", null);
        common = {
            name: {
                en: "Guest QRCode",
                de: "Gäste QRCode",
                ru: "Гостевой QRCode",
                pt: "QRCode convidado",
                nl: "Gast QRCode",
                fr: "Code QR invité",
                it: "QRCode ospite",
                es: "Guest QRCode",
                pl: "Gości QRCode",
                uk: "Гість QRCode",
                "zh-cn": "来宾 QRCode",
            },
            type: "string",
            role: "state",
            desc: "Guest QRCode",
            read: true,
            write: false,
            def: "",
        };
        await this.createDataPoint(`${id.dp}.TR_064.States.wlanguestQRCode`, common, "state", null);
        common = {
            name: {
                en: "Possible commands",
                de: "Mögliche Befehle",
                ru: "Возможные команды",
                pt: "Comandos possíveis",
                nl: "Mogelijke opdrachten",
                fr: "Commandes possibles",
                it: "Possibili comandi",
                es: "Posibles comandos",
                pl: "Możliwe polecenia",
                uk: "Можливі команди",
                "zh-cn": "可能的命令",
            },
            type: "string",
            role: "json",
            desc: "Possible commands",
            read: true,
            write: false,
            def: "",
        };
        await this.createDataPoint(`${id.dp}.TR_064.States.sendCommandPossible`, common, "state", "");
        common = {
            name: {
                en: "Response",
                de: "Antwort",
                ru: "Ответ",
                pt: "Resposta",
                nl: "Response",
                fr: "Réponse ",
                it: "Risposta",
                es: "Respuesta",
                pl: "Response",
                uk: "Відповідь",
                "zh-cn": "答复",
            },
            type: "string",
            role: "state",
            desc: "Response",
            read: true,
            write: false,
            def: "",
        };
        await this.createDataPoint(`${id.dp}.TR_064.States.response`, common, "state", "");
        common = {
            name: {
                en: "XML Response",
                de: "XML Antwort",
                ru: "XML Ответ",
                pt: "XML Resposta",
                nl: "XML Respons",
                fr: "XML Réponse",
                it: "XML Risposta",
                es: "XML Respuesta",
                pl: "XML Odpowiedź",
                uk: "Список Відправити",
                "zh-cn": "XML 函数 回应",
            },
            type: "string",
            role: "state",
            desc: "XML Response",
            read: true,
            write: false,
            def: "",
        };
        await this.createDataPoint(`${id.dp}.TR_064.States.responseXML`, common, "state", "");
        common = {
            name: {
                en: "Last update",
                de: "Letzte Aktualisierung",
                ru: "Последнее обновление",
                pt: "Última atualização",
                nl: "Laatste update",
                fr: "Dernière mise à jour",
                it: "Ultimo aggiornamento",
                es: "Última actualización",
                pl: "Ostatnia aktualizacja",
                uk: "Останнє оновлення",
                "zh-cn": "上次更新",
            },
            type: "number",
            role: "value.time",
            desc: "Last update",
            read: true,
            write: false,
            def: 0,
        };
        await this.createDataPoint(`${id.dp}.TR_064.States.lastupdate`, common, "state", 0);
        common = {
            name: {
                en: "external IPv4",
                de: "externe IPv4",
                ru: "внешний IPv4",
                pt: "iPv4 externo",
                nl: "externe IPv4",
                fr: "iPv4 externe",
                it: "iPv4 esterno",
                es: "iPv4 externa",
                pl: "zewnętrzny IPv4",
                uk: "зовнішній IPv4",
                "zh-cn": "外部 IPv4 软件",
            },
            type: "string",
            role: "info.ip",
            desc: "external IPv4",
            read: true,
            write: false,
            def: "",
        };
        await this.createDataPoint(`${id.dp}.TR_064.States.externalIPv4`, common, "state", "");
        common = {
            name: {
                en: "external IPv6",
                de: "externe IPv6",
                ru: "внешний IPv6",
                pt: "iPv6 externo",
                nl: "externe IPv6",
                fr: "iPv6 externe",
                it: "iPv6 esterno",
                es: "iPv6 externo",
                pl: "zewnętrzny IPv6",
                uk: "зовнішній IPv6",
                "zh-cn": "外部 IPv6",
            },
            type: "string",
            role: "info.ip",
            desc: "external IPv6",
            read: true,
            write: false,
            def: "",
        };
        await this.createDataPoint(`${id.dp}.TR_064.States.externalIPv6`, common, "state", "");
        common = {
            name: {
                en: "external prefix IPv6",
                de: "externes Präfix IPv6",
                ru: "внешний префикс IPv6",
                pt: "prefixo externo IPv6",
                nl: "extern voorvoegsel IPv6",
                fr: "préfixe externe IPv6",
                it: "prefisso esterno IPv6",
                es: "prefijo externo IPv6",
                pl: "przedrostek zewnętrzny IPv6",
                uk: "зовнішній префікс IPv6",
                "zh-cn": "外部前缀 IPv6",
            },
            type: "string",
            role: "info.ip",
            desc: "external prefix IPv6",
            read: true,
            write: false,
            def: "",
        };
        await this.createDataPoint(`${id.dp}.TR_064.States.externalIPv6Prefix`, common, "state", "");
        common = {
            name: {
                en: "MAC",
                de: "MAC",
                ru: "MAC",
                pt: "MAC",
                nl: "MAC",
                fr: "MAC",
                it: "MAC",
                es: "MAC",
                pl: "MAC",
                uk: "МАПА",
                "zh-cn": "邮件",
            },
            type: "string",
            role: "info.mac",
            desc: "MAC",
            read: true,
            write: false,
            def: "",
        };
        await this.createDataPoint(`${id.dp}.TR_064.States.mac`, common, "state", "");
        common = {
            name: {
                en: "Upstream max bit rate",
                de: "Upstream max Bitrate",
                ru: "Скорость макс",
                pt: "Taxa de bits máxima a montante",
                nl: "Upstream max bit rate",
                fr: "Taux de débit maximal en amont",
                it: "Velocità max bit a monte",
                es: "Tasa máxima de bits",
                pl: "Upstream max bit rate",
                uk: "Максимальна швидкість потоку",
                "zh-cn": "上游最大比特率",
            },
            type: "number",
            role: "value",
            desc: "Upstream max bit rate",
            read: true,
            write: false,
            def: 0,
        };
        await this.createDataPoint(`${id.dp}.TR_064.States.upstream`, common, "state", 0);
        common = {
            name: {
                en: "Downstream max bit rate",
                de: "Downstream max Bitrate",
                ru: "Скорость макс",
                pt: "Taxa de bits máx",
                nl: "Downstream max bit rate",
                fr: "Taux de débit maximal en aval",
                it: "Velocità max bit a valle",
                es: "Tasa máxima de precipitación",
                pl: "Maksymalna szybkość transmisji w dół",
                uk: "Поза «69»",
                "zh-cn": "下游最大比特率",
            },
            type: "number",
            role: "value",
            desc: "Downstream max bit rate",
            read: true,
            write: false,
            def: 0,
        };
        await this.createDataPoint(`${id.dp}.TR_064.States.downstream`, common, "state", 0);
        common = {
            name: {
                en: "Status",
                de: "Status",
                ru: "Статус",
                pt: "Estado",
                nl: "Status",
                fr: "État",
                it: "Stato",
                es: "Situación",
                pl: "Status",
                uk: "Статус на сервери",
                "zh-cn": "状态",
            },
            type: "string",
            role: "state",
            desc: "Status",
            read: true,
            write: false,
            def: "",
        };
        await this.createDataPoint(`${id.dp}.TR_064.States.status`, common, "state", "");
        common = {
            name: {
                en: "Error",
                de: "Fehler",
                ru: "Ошибка",
                pt: "Erro",
                nl: "Fout",
                fr: "Erreur",
                it: "Errore",
                es: "Error",
                pl: "Błąd",
                uk: "Помилка",
                "zh-cn": "错误",
            },
            type: "string",
            role: "state",
            desc: "Error",
            read: true,
            write: false,
            def: "",
            states: {
                ERROR_NONE: "No error",
                ERROR_ISP_TIME_OUT: "ISP timeout",
                ERROR_COMMAND_ABORTED: "Command aborted",
                ERROR_NOT_ENABLED_FOR_INTERNET: "Not enabled for internet",
                ERROR_BAD_PHONE_NUMBER: "Bad phone number",
                ERROR_USER_DISCONNECT: "User disconnect",
                ERROR_ISP_DISCONNECT: "ISP disconnect",
                ERROR_IDLE_DISCONNECT: "IDLE disconnect",
                ERROR_FORCED_DISCONNECT: "Forced disconnect",
                ERROR_SERVER_OUT_OF_RESOURCES: "Server out of resources",
                ERROR_RESTRICTED_LOGON_HOURS: "Restricted logon hours",
                ERROR_ACCOUNT_DISABLED: "Account disabled",
                ERROR_ACCOUNT_EXPIRED: "Account expired",
                ERROR_PASSWORD_EXPIRED: "Password expired",
                ERROR_AUTHENTICATION_FAILURE: "Authentication failure",
                ERROR_NO_DIALTONE: "No dial tone",
                ERROR_NO_CARRIER: "No carrier",
                ERROR_NO_ANSWER: "No answer",
                ERROR_LINE_BUSY: "Busy",
                ERROR_UNSUPPORTED_BITSPERSECOND: "Unsupported bitspersecond",
                ERROR_TOO_MANY_LINE_ERRORS: "Too many line errors",
                ERROR_IP_CONFIGURATION: "IP Configuration",
                ERROR_UNKNOWN: "Unknown",
            },
        };
        await this.createDataPoint(`${id.dp}.TR_064.States.error`, common, "state", "");
    },
    /**
     * @param {object} id
     */
    async createCallmonitor(id) {
        let common = {};
        common = {
            name: {
                en: "TR-064",
                de: "TR-064",
                ru: "TR-064",
                pt: "TR-064",
                nl: "TR-064",
                fr: "TR-064",
                it: "TR-064",
                es: "TR-064",
                pl: "TR- 064",
                uk: "Р-064",
                "zh-cn": "TR-064号",
            },
            desc: "Create by Adapter",
            icon: "img/tr-064.png",
        };
        await this.createDataPoint(`${id.dp}.TR_064`, common, "folder", null);
        common = {
            name: {
                en: "Callmonitor",
                de: "Anrufmonitor",
                ru: "Звони",
                pt: "Chamada",
                nl: "Callmonitor",
                fr: "Télécommande",
                it: "Callmonitor",
                es: "Callmonitor",
                pl: "Callmonitor",
                uk: "Кальвадос",
                "zh-cn": "调用器",
            },
            desc: "Create by Adapter",
            icon: "img/callmonitor.png",
            statusStates: {
                onlineId: `${this.namespace}.${id.dp}.TR_064.Callmonitor.status`,
            },
        };
        await this.createDataPoint(`${id.dp}.TR_064.Callmonitor`, common, "folder", null);
        common = {
            name: {
                en: "Incoming call",
                de: "Eingehender Anruf",
                ru: "Входящий вызов",
                pt: "Chamada recebida",
                nl: "Binnenkomende oproep",
                fr: "Appel entrant",
                it: "Chiamata in arrivo",
                es: "Llamada entrante",
                pl: "Połączenie przychodzące",
                uk: "Вхідний дзвінок",
                "zh-cn": "来电",
            },
            desc: "Incoming call",
            icon: "img/inbound.png",
        };
        await this.createDataPoint(`${id.dp}.TR_064.Callmonitor.inbound`, common, "folder", null);
        common = {
            name: {
                en: "Outgoing call",
                de: "Abgehender Anruf",
                ru: "Выходной звонок",
                pt: "Chamada de saída",
                nl: "Uitgaande oproep",
                fr: "Appel sortant",
                it: "Chiamata in uscita",
                es: "Llamada saliente",
                pl: "Połączenie wychodzące",
                uk: "Вихідний дзвінок",
                "zh-cn": "正在通话",
            },
            desc: "Outgoing call",
            icon: "img/outbound.png",
        };
        await this.createDataPoint(`${id.dp}.TR_064.Callmonitor.outbound`, common, "folder", null);
        common = {
            name: {
                en: "Last call",
                de: "Letzter Aufruf",
                ru: "Последний звонок",
                pt: "Última chamada",
                nl: "Laatste oproep",
                fr: "Dernier appel",
                it: "Ultima chiamata",
                es: "Última llamada",
                pl: "Ostatnie połączenie",
                uk: "Останній дзвінок",
                "zh-cn": "最后电话",
            },
            desc: "Outgoing call",
            icon: "img/lastcall.png",
        };
        await this.createDataPoint(`${id.dp}.TR_064.Callmonitor.lastcall`, common, "folder", null);
        common = {
            name: {
                en: "connect",
                de: "verbindung",
                ru: "разъем",
                pt: "conexão",
                nl: "verbinden",
                fr: "connexion",
                it: "collegamento",
                es: "conectar",
                pl: "połączenie",
                uk: "з'єднання",
                "zh-cn": "连接",
            },
            desc: "Outgoing call",
            icon: "img/connect.png",
        };
        await this.createDataPoint(`${id.dp}.TR_064.Callmonitor.connect`, common, "folder", null);
        common = {
            name: {
                en: "Called",
                de: "Angerufen",
                ru: "Звонок",
                pt: "Chamado",
                nl: "Gebeld",
                fr: "Appelé",
                it: "Chiamato",
                es: "Llamada",
                pl: "Wezwano",
                uk: "Зателефонувати",
                "zh-cn": "已调用",
            },
            type: "string",
            role: "state",
            desc: "Called",
            read: true,
            write: false,
            def: "",
        };
        await this.createDataPoint(`${id.dp}.TR_064.Callmonitor.connect.called`, common, "state", null);
        await this.createDataPoint(`${id.dp}.TR_064.Callmonitor.lastcall.called`, common, "state", null);
        await this.createDataPoint(`${id.dp}.TR_064.Callmonitor.outbound.called`, common, "state", null);
        await this.createDataPoint(`${id.dp}.TR_064.Callmonitor.inbound.called`, common, "state", null);
        common = {
            name: {
                en: "Called Name",
                de: "Angerufen Name",
                ru: "Названное имя",
                pt: "Nome chamado",
                nl: "Genoemde naam",
                fr: "Nom",
                it: "Nome chiamato",
                es: "Nombre llamado",
                pl: "Nazwa",
                uk: "Ім'я",
                "zh-cn": "名称",
            },
            type: "string",
            role: "state",
            desc: "Called name",
            read: true,
            write: false,
            def: "",
        };
        await this.createDataPoint(`${id.dp}.TR_064.Callmonitor.connect.calledname`, common, "state", null);
        await this.createDataPoint(`${id.dp}.TR_064.Callmonitor.lastcall.calledname`, common, "state", null);
        await this.createDataPoint(`${id.dp}.TR_064.Callmonitor.outbound.calledname`, common, "state", null);
        await this.createDataPoint(`${id.dp}.TR_064.Callmonitor.inbound.calledname`, common, "state", null);
        common = {
            name: {
                en: "Caller",
                de: "Anrufer",
                ru: "Caller",
                pt: "Caller",
                nl: "Beller",
                fr: "Appeleur",
                it: "Caller",
                es: "Caller",
                pl: "Dzwoniący",
                uk: "Дзвоните до",
                "zh-cn": "打电话者",
            },
            type: "string",
            role: "state",
            desc: "Caller",
            read: true,
            write: false,
            def: "",
        };
        await this.createDataPoint(`${id.dp}.TR_064.Callmonitor.connect.caller`, common, "state", null);
        await this.createDataPoint(`${id.dp}.TR_064.Callmonitor.lastcall.caller`, common, "state", null);
        await this.createDataPoint(`${id.dp}.TR_064.Callmonitor.outbound.caller`, common, "state", null);
        await this.createDataPoint(`${id.dp}.TR_064.Callmonitor.inbound.caller`, common, "state", null);
        common = {
            name: {
                en: "Caller name",
                de: "Name des Anrufers",
                ru: "Имя звонка",
                pt: "Nome da chamada",
                nl: "Bellernaam",
                fr: "Nom de l'appelant",
                it: "Nome chiamante",
                es: "Nombre de llamada",
                pl: "Nazwa dzwoniącego",
                uk: "Ім'я платника",
                "zh-cn": "调用名称",
            },
            type: "string",
            role: "state",
            desc: "Caller name",
            read: true,
            write: false,
            def: "",
        };
        await this.createDataPoint(`${id.dp}.TR_064.Callmonitor.connect.callername`, common, "state", null);
        await this.createDataPoint(`${id.dp}.TR_064.Callmonitor.lastcall.callername`, common, "state", null);
        await this.createDataPoint(`${id.dp}.TR_064.Callmonitor.outbound.callername`, common, "state", null);
        await this.createDataPoint(`${id.dp}.TR_064.Callmonitor.inbound.callername`, common, "state", null);
        common = {
            name: {
                en: "Timestamp",
                de: "Zeitstempel",
                ru: "Timestamp",
                pt: "Temporada",
                nl: "Tijdstempel",
                fr: "Timbre",
                it: "Timestamp",
                es: "Timestamp",
                pl: "Znacznik czasu",
                uk: "Таймер",
                "zh-cn": "时间戳",
            },
            type: "number",
            role: "value.time",
            desc: "Timestamp",
            read: true,
            write: false,
            def: 0,
        };
        await this.createDataPoint(`${id.dp}.TR_064.Callmonitor.connect.timestamp`, common, "state", null);
        await this.createDataPoint(`${id.dp}.TR_064.Callmonitor.lastcall.timestamp`, common, "state", null);
        await this.createDataPoint(`${id.dp}.TR_064.Callmonitor.outbound.timestamp`, common, "state", null);
        await this.createDataPoint(`${id.dp}.TR_064.Callmonitor.inbound.timestamp`, common, "state", null);
        common = {
            name: {
                en: "Duration",
                de: "Dauer",
                ru: "Продолжительность",
                pt: "Duração",
                nl: "Duur",
                fr: "Durée",
                it: "Durata",
                es: "Duración",
                pl: "Czas trwania",
                uk: "Тривалість",
                "zh-cn": "会期",
            },
            type: "number",
            role: "state",
            desc: "Duration",
            read: true,
            write: false,
            def: 0,
        };
        await this.createDataPoint(`${id.dp}.TR_064.Callmonitor.lastcall.duration`, common, "state", null);
        common = {
            name: {
                en: "Type",
                de: "Typ",
                ru: "Тип",
                pt: "Tipo",
                nl: "Type",
                fr: "Type",
                it: "Tipo",
                es: "Tipo",
                pl: "Rodzaj",
                uk: "Тип",
                "zh-cn": "类型",
            },
            type: "string",
            role: "state",
            desc: "Type",
            read: true,
            write: false,
            def: "",
            states: { Ring: "RING", Call: "CALL", PickUp: "CONNECT", HangUp: "DISCONNECT" },
        };
        await this.createDataPoint(`${id.dp}.TR_064.Callmonitor.lastcall.type`, common, "state", null);
        await this.createDataPoint(`${id.dp}.TR_064.Callmonitor.connect.type`, common, "state", null);
        await this.createDataPoint(`${id.dp}.TR_064.Callmonitor.outbound.type`, common, "state", null);
        await this.createDataPoint(`${id.dp}.TR_064.Callmonitor.inbound.type`, common, "state", null);
        common = {
            name: {
                en: "SIP",
                de: "SIP",
                ru: "SIP",
                pt: "SIP",
                nl: "SIP",
                fr: "PAS",
                it: "SPESE",
                es: "SIP",
                pl: "SIP",
                uk: "СПИС",
                "zh-cn": "SIP 执行方案",
            },
            type: "string",
            role: "state",
            desc: "SIP",
            read: true,
            write: false,
            def: "",
        };
        await this.createDataPoint(`${id.dp}.TR_064.Callmonitor.lastcall.sip`, common, "state", null);
        await this.createDataPoint(`${id.dp}.TR_064.Callmonitor.connect.sip`, common, "state", null);
        await this.createDataPoint(`${id.dp}.TR_064.Callmonitor.outbound.sip`, common, "state", null);
        await this.createDataPoint(`${id.dp}.TR_064.Callmonitor.inbound.sip`, common, "state", null);
        common = {
            name: {
                en: "Extention",
                de: "Nebenstelle",
                ru: "Удержание",
                pt: "Execução",
                nl: "Aanhouding",
                fr: "Étendue",
                it: "Estensione",
                es: "Extensión",
                pl: "Rozpowszechnienie",
                uk: "Закінчення",
                "zh-cn": "范围",
            },
            type: "number",
            role: "state",
            desc: "Extention",
            read: true,
            write: false,
            def: 0,
            states: {
                1: "Analogs",
                2: "Analogs",
                3: "Analogs",
                4: "ISDN",
                5: "Fax",
                10: "DECT-Phone",
                11: "DECT-Phone",
                12: "DECT-Phone",
                13: "DECT-Phone",
                14: "DECT-Phone",
                15: "DECT-Phone",
                16: "DECT-Phone",
                17: "DECT-Phone",
                18: "DECT-Phone",
                19: "DECT-Phone",
                20: "VoIP-Phone",
                21: "VoIP-Phone",
                22: "VoIP-Phone",
                23: "VoIP-Phone",
                24: "VoIP-Phone",
                25: "VoIP-Phone",
                26: "VoIP-Phone",
                27: "VoIP-Phone",
                28: "VoIP-Phone",
                29: "VoIP-Phone",
                40: "Answering machine",
                41: "Answering machine",
                42: "Answering machine",
                43: "Answering machine",
                44: "Answering machine",
            },
        };
        await this.createDataPoint(`${id.dp}.TR_064.Callmonitor.connect.extension`, common, "state", null);
        await this.createDataPoint(`${id.dp}.TR_064.Callmonitor.lastcall.extension`, common, "state", null);
        await this.createDataPoint(`${id.dp}.TR_064.Callmonitor.outbound.extension`, common, "state", null);
        await this.createDataPoint(`${id.dp}.TR_064.Callmonitor.inbound.extension`, common, "state", null);
        common = {
            name: {
                en: "ID",
                de: "ID",
                ru: "ID",
                pt: "ID",
                nl: "ID",
                fr: "NUMÉRO",
                it: "ID",
                es: "ID",
                pl: "ID",
                uk: "ІМ'Я",
                "zh-cn": "身份证",
            },
            type: "number",
            role: "state",
            desc: "ID",
            read: true,
            write: false,
            def: 0,
        };
        await this.createDataPoint(`${id.dp}.TR_064.Callmonitor.connect.id`, common, "state", null);
        await this.createDataPoint(`${id.dp}.TR_064.Callmonitor.lastcall.id`, common, "state", null);
        await this.createDataPoint(`${id.dp}.TR_064.Callmonitor.outbound.id`, common, "state", null);
        await this.createDataPoint(`${id.dp}.TR_064.Callmonitor.inbound.id`, common, "state", null);
        common = {
            name: {
                en: "JSON",
                de: "JSON",
                ru: "JSON",
                pt: "JSON",
                nl: "JSON",
                fr: "JSON",
                it: "JSON",
                es: "JSON",
                pl: "JSON",
                uk: "СОНЦЕ",
                "zh-cn": "贾森",
            },
            type: "string",
            role: "json",
            desc: "JSON",
            read: true,
            write: false,
            def: "{}",
        };
        await this.createDataPoint(`${id.dp}.TR_064.Callmonitor.connect.json`, common, "state", null);
        await this.createDataPoint(`${id.dp}.TR_064.Callmonitor.lastcall.json`, common, "state", null);
        await this.createDataPoint(`${id.dp}.TR_064.Callmonitor.outbound.json`, common, "state", null);
        await this.createDataPoint(`${id.dp}.TR_064.Callmonitor.inbound.json`, common, "state", null);
        common = {
            name: {
                en: "Action",
                de: "Aktion",
                ru: "Действия",
                pt: "Acção",
                nl: "Actie",
                fr: "Décision",
                it: "Azione",
                es: "Medida",
                pl: "Działanie",
                uk: "Дія",
                "zh-cn": "行动",
            },
            type: "string",
            role: "state",
            desc: "Action",
            read: true,
            write: false,
            def: "",
            states: {
                DISCONNECT: "HangUp",
                CALL: "Call",
                CONNECT: "PickUp",
                RING: "Ring",
            },
        };
        await this.createDataPoint(`${id.dp}.TR_064.Callmonitor.action`, common, "state", null);
        common = {
            name: {
                en: "ID",
                de: "ID",
                ru: "ID",
                pt: "ID",
                nl: "ID",
                fr: "NUMÉRO",
                it: "ID",
                es: "ID",
                pl: "ID",
                uk: "ІМ'Я",
                "zh-cn": "身份证",
            },
            type: "number",
            role: "value",
            desc: "Status",
            read: true,
            write: false,
            def: 0,
        };
        await this.createDataPoint(`${id.dp}.TR_064.Callmonitor.action_id`, common, "state", null);
        common = {
            name: {
                en: "Status",
                de: "Status",
                ru: "Статус",
                pt: "Estado",
                nl: "Status",
                fr: "État",
                it: "Stato",
                es: "Situación",
                pl: "Status",
                uk: "Статус на сервери",
                "zh-cn": "现状",
            },
            type: "boolean",
            role: "indicator.reachable",
            desc: "Status",
            read: true,
            write: false,
            def: false,
        };
        await this.createDataPoint(`${id.dp}.TR_064.Callmonitor.status`, common, "state", false);
        common = {
            name: {
                en: "Call data",
                de: "Anrufdaten",
                ru: "Данные",
                pt: "Dados de chamada",
                nl: "Oproepgegevens",
                fr: "Données d'appel",
                it: "Dati di chiamata",
                es: "Datos de llamada",
                pl: "Dane wywoławcze",
                uk: "Контактні дані",
                "zh-cn": "调用数据",
            },
            type: "string",
            role: "json",
            desc: "Call raw",
            read: true,
            write: false,
            def: "{}",
        };
        await this.createDataPoint(`${id.dp}.TR_064.Callmonitor.calldata`, common, "state", null);
    },
    /**
     * @param {object} id
     * @param {object} login
     */
    async createDevice(id, login) {
        let common = {};
        let icons;
        if (id.picture != null && id.picture != "") {
            icons = { icon: id.picture };
        }
        common = {
            name: id.ip_name,
            desc: id.ip_name,
            ...icons,
            statusStates: {
                onlineId: `${this.namespace}.${id.dp}.DECT_Control.online`,
            },
        };
        await this.createDataPoint(id.dp, common, "device", null);
        common = {
            name: {
                en: "Status",
                de: "Status",
                ru: "Статус",
                pt: "Estado",
                nl: "Status",
                fr: "État",
                it: "Stato",
                es: "Situación",
                pl: "Status",
                uk: "Статус на сервери",
                "zh-cn": "现状",
            },
            desc: "Create by Adapter",
            icon: "img/status.png",
        };
        await this.createDataPoint(`${id.dp}.DECT_Control`, common, "folder", null);
        common = {
            name: {
                en: "Own request",
                de: "Eigene Anfrage",
                ru: "Собственный запрос",
                pt: "Pedido próprio",
                nl: "Eigen verzoek",
                fr: "Demande propre",
                it: "Richiesta",
                es: "Solicitud propia",
                pl: "Wniosek własny",
                uk: "Власне замовлення",
                "zh-cn": "自行请求",
            },
            type: "string",
            role: "state",
            desc: "Own request",
            read: true,
            write: true,
            def: "",
        };
        await this.createDataPoint(`${id.dp}.DECT_Control.own_request`, common, "state", "");
        common = {
            name: {
                en: "Interval",
                de: "Intervall",
                ru: "Интервал",
                pt: "Intervalo",
                nl: "Interval",
                fr: "Intervalle",
                it: "Intervallo",
                es: "Interval",
                pl: "Przerwanie",
                uk: "Інтервал",
                "zh-cn": "间隔",
            },
            type: "string",
            role: "level",
            desc: "Interval",
            read: true,
            write: false,
            def: "",
        };
        await this.createDataPoint(`${id.dp}.DECT_Control.interval`, common, "state", "");
        common = {
            name: {
                en: "Response own request",
                de: "Antwort auf eigene Anfrage",
                ru: "Ответный запрос",
                pt: "Pedido próprio de resposta",
                nl: "Antwoord op eigen verzoek",
                fr: "Réponse propre demande",
                it: "Risposta richiesta",
                es: "Solicitud propia",
                pl: "Wniosek o udzielenie odpowiedzi",
                uk: "Відповідь на власний запит",
                "zh-cn": "自行答复请求",
            },
            type: "string",
            role: "json",
            desc: "Response own request",
            read: true,
            write: false,
            def: "{}",
        };
        await this.createDataPoint(`${id.dp}.DECT_Control.own_request_response`, common, "state", "");
        common = {
            type: "boolean",
            role: "info.status",
            name: {
                en: "Status Fritzbox",
                de: "Status Fritzbox",
                ru: "Статус Fritzbox",
                pt: "Status Fritzbox",
                nl: "Status Fritzbox",
                fr: "Statut Fritzbox",
                it: "Stato Fritzbox",
                es: "Estado Fritzbox",
                pl: "Status Fritzbox",
                uk: "Статус Фрицбокс",
                "zh-cn": "弗朗西斯·弗里克地位",
            },
            desc: "Create by Adapter",
            read: true,
            write: false,
            def: false,
        };
        await this.createDataPoint(`${id.dp}.DECT_Control.online`, common, "state", true);
        common = {
            type: "string",
            role: "state",
            name: {
                en: "Current SID",
                de: "Aktuelle SID",
                ru: "Текущий SID",
                pt: "SID atual",
                nl: "Current SID",
                fr: "SID actuel",
                it: "SID corrente",
                es: "SID actual",
                pl: "Aktualny SID",
                uk: "Поточний SID",
                "zh-cn": "目前",
            },
            desc: "Create by Adapter",
            read: true,
            write: false,
            def: "",
        };
        await this.createDataPoint(`${id.dp}.DECT_Control.sid`, common, "state", login.SessionInfo.SID);
        common = {
            name: {
                en: "Start DECT-ULE paring",
                de: "DECT-ULE paring starten",
                ru: "Начните DECT-ULE paring",
                pt: "Comece a analisar DECT-ULE",
                nl: "Begin met DECT-ULE paring",
                fr: "Commencer le parage DECT-ULE",
                it: "Iniziare la parata DECT-ULE",
                es: "Comience a cortar DECT-ULE",
                pl: "Początek DECT-ULE",
                uk: "Старт DECT-ULE парування",
                "zh-cn": "A. 导 言",
            },
            type: "boolean",
            role: "button",
            write: false,
            read: true,
            def: false,
        };
        await this.createDataPoint(`${id.dp}.DECT_Control.startulesubscription`, common, "state", false);
        common = {
            name: {
                en: "DECT-ULE device registration status",
                de: "DECT-ULE Geräteregistrierungsstatus",
                ru: "Статус регистрации устройства DECT-ULE",
                pt: "Status de registro de dispositivo DECT-ULE",
                nl: "DECT-ULE apparaat registratie status",
                fr: "État d ' enregistrement des dispositifs DECT-ULE",
                it: "Stato di registrazione del dispositivo DECT-ULE",
                es: "Estado de registro del dispositivo DECT-ULE",
                pl: "Status rejestracyjny DECT-ULE",
                uk: "Статус на сервери",
                "zh-cn": "DECT-ULE设备登记状况",
            },
            type: "number",
            role: "info",
            write: false,
            read: true,
            def: 0,
            states: {
                0: "Anmeldung läuft nicht",
                1: "Anmeldung läuft",
                2: "timeout",
                3: "sonstiger Error Unterknoten",
            },
        };
        await this.createDataPoint(`${id.dp}.DECT_Control.subscriptionstate`, common, "state", 0);
        common = {
            name: {
                en: "latest AIN",
                de: "neues von AIN",
                ru: "последняя",
                pt: "mais recente AIN",
                nl: "laatste AIN",
                fr: "dernier AIN",
                it: "aIN",
                es: "última AIN",
                pl: "aIN",
                uk: "останні новини",
                "zh-cn": "最新信息",
            },
            type: "number",
            role: "info",
            write: false,
            read: true,
            def: 0,
        };
        await this.createDataPoint(`${id.dp}.DECT_Control.subscriptionslatest`, common, "state", 0);
        common = {
            name: {
                en: "Reload DECT-ULE device registration status",
                de: "DECT-ULE Geräteregistrierungsstatus neu laden",
                ru: "Reload DECT-ULE статус регистрации устройства",
                pt: "Recarregar o status de registro do dispositivo DECT-ULE",
                nl: "Herladen DECTULE apparaat registratie status",
                fr: "Reload DECT-ULE device registration status",
                it: "Ricarica lo stato di registrazione del dispositivo DECT-ULE",
                es: "Cargue el estado de registro del dispositivo DECT-ULE",
                pl: "Status rejestracyjny DECT-ULE",
                uk: "Статус на сервери",
                "zh-cn": "D. 重载车辆登记状况",
            },
            type: "boolean",
            role: "button",
            write: false,
            read: true,
            def: false,
        };
        await this.createDataPoint(`${id.dp}.DECT_Control.getsubscriptionstate`, common, "state", false);
        common = {
            type: "number",
            role: "value.time",
            name: {
                en: "Create SID",
                de: "SID erstellen",
                ru: "Создать SID",
                pt: "Criar SID",
                nl: "Creatie SID",
                fr: "Créer SID",
                it: "Creare SID",
                es: "Crear SID",
                pl: "Create SID",
                uk: "Створити SID",
                "zh-cn": "D. 创建国际发展中心",
            },
            desc: "Create by Adapter",
            read: true,
            write: false,
            def: 0,
        };
        await this.createDataPoint(`${id.dp}.DECT_Control.sid_create`, common, "state", Date.now());
    },
    /**
     * @param {string} ident
     * @param {object} common
     * @param {string} types
     * @param {string|number|boolean|null|undefined} value
     * @param {object|null|undefined} [native=null]
     */
    async createDataPoint(ident, common, types, value, native) {
        const nativvalue = !native ? { native: {} } : { native: native };
        const obj = await this.getObjectAsync(ident);
        if (!obj) {
            await this.setObjectNotExistsAsync(ident, {
                type: types,
                common: common,
                ...nativvalue,
            }).catch(error => {
                this.log.warn(`createDataPoint: ${error}`);
            });
        } else {
            let ischange = false;
            if (obj.common && Object.keys(obj.common).length == Object.keys(common).length) {
                for (const key in common) {
                    if (obj.common[key] == null) {
                        ischange = true;
                        break;
                    } else if (JSON.stringify(obj.common[key]) != JSON.stringify(common[key])) {
                        ischange = true;
                        break;
                    }
                }
            } else {
                ischange = true;
            }
            if (JSON.stringify(obj.type) != JSON.stringify(types)) {
                ischange = true;
            }
            if (native) {
                if (Object.keys(obj.native).length == Object.keys(nativvalue.native).length) {
                    for (const key in obj.native) {
                        if (nativvalue.native[key] == null) {
                            ischange = true;
                            delete obj["native"];
                            obj["native"] = native;
                            break;
                        } else if (JSON.stringify(obj.native[key]) != JSON.stringify(nativvalue.native[key])) {
                            ischange = true;
                            obj.native[key] = nativvalue.native[key];
                            break;
                        }
                    }
                } else {
                    ischange = true;
                }
            }
            if (ischange) {
                this.log.debug(`INFORMATION - Change common: ${this.namespace}.${ident}`);
                delete obj["common"];
                obj["common"] = common;
                obj["type"] = types;
                await this.setObjectAsync(ident, obj);
            }
        }
        if (value != null) {
            await this.setState(ident, { val: value, ack: true });
        }
    },
};
