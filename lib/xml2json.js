/*
copy of https://github.com/enkidoo-ai/xml2json
The MIT License (MIT)
Copyright (c) 2016 Société Enkidoo Technologies Inc.

extended by corrections for
- tag names also in subhierarchy causing maximum stack trace fault
- tags with 2digit length
- only one clean

all part of PR #8
*/

"use strict";

module.exports = {
    xml2json: xml2json,
};

//***********************************************************************
// Main function. Clears the given xml and then starts the recursion
//***********************************************************************
function xml2json(xmlStr) {
    xmlStr = cleanXML(xmlStr);
    return xml2jsonRecurse(xmlStr, false);
}
let fw = "";
let mask = "0";
let device = "";
let dect350 = "";
let dect350_is = false;
let dect350_name = "";
let dect350_bat = -1;
let dect350_batlow = "";
let blind = "";
let control = "";
let onoff = "";
let statistic = "";
let template = "";
const boolean_value = [
    "present",
    "txbusy",
    "lock",
    "batterylow",
    "devicelock",
    "windowopenactiv",
    "boostactive",
    "summeractive",
    "holidayactive",
    "fullcolorsupport",
    "synchronized",
    "adaptiveHeatingActive",
    "adaptiveHeatingRunning",
    "mapped",
    "autocreate",
    "active",
];
const no_value = [
    "hue",
    "saturation",
    "unmapped_hue",
    "unmapped_saturation",
    "temperature",
    "lastalertchgtimestamp",
    "offset",
    "celsius",
    "absenk",
    "tsoll",
    "tist",
    "tchange",
    "komfort",
    "lastpressedtimestamp",
    "mask",
    "latestain",
];
const template_data = [
    "hkr_summer",
    "hkr_temperature",
    "hkr_holidays",
    "hkr_time_table",
    "relay_manual",
    "relay_automatic",
    "level",
    "color",
    "dialhelper",
    "sun_simulation",
    "subs_templates",
    "main_wifi",
    "guest_wifi",
    "tam_control",
    "http_request",
    "timer_control",
    "switch_master",
    "custom_notification",
];
const temp = ["absenk", "tsoll", "tist", "tchange", "komfort", "offset"];
const json_empty = ["metadata"];
const array_empty = ["devices", "triggers", "sub_templates", "applymask"];
//***********************************************************************
// Recursive function that creates a JSON object with a given XML string.
//***********************************************************************
function xml2jsonRecurse(xmlStr, states) {
    if (!states) {
        fw = "";
        mask = "0";
        dect350 = "";
        dect350_is = false;
        dect350_name = "";
        dect350_bat = -1;
        dect350_batlow = "";
        device = "";
        blind = "";
        control = "";
        onoff = "";
        statistic = "";
    }
    const obj = {};
    let tagName;
    let indexClosingTag;
    let inner_substring;
    let tempVal;
    let openingTag;
    try {
        while (xmlStr.match(/<[^/][^>]*>/)) {
            openingTag = xmlStr.match(/<[^/][^>]*>/)[0];
            tagName = openingTag.substring(1, openingTag.length - 1);
            indexClosingTag = xmlStr.indexOf(openingTag.replace("<", "</"));

            // indexClosingTag is the first occurance of the closing tag, if there are same tags in other hierarchy, then this is the wrong catch
            // search for next openingTag is needed
            // if the next openingTag has smaller index than the next closingIndex then this portion must be part of the string
            let tmpString = xmlStr.substring(openingTag.length, xmlStr.length);
            let nextOpeningIndex = tmpString.indexOf(openingTag);
            let nextClosingIndex = tmpString.indexOf(openingTag.replace("<", "</"));
            let cutLength = openingTag.length + nextClosingIndex;
            // indexClosingTag to be replaced when not beeing itself and there is deeper level with same tagName && tempClosingIndex < nextOpeningIndex
            // repeat the search until only closing tag exists
            let j = 1;
            while (indexClosingTag != -1 && nextOpeningIndex != -1 && nextOpeningIndex < nextClosingIndex) {
                //console.log(' while ', j);
                tmpString = xmlStr.substring(cutLength + (openingTag.length + 1) * j, xmlStr.length);
                nextOpeningIndex = tmpString.indexOf(openingTag);
                nextClosingIndex = tmpString.indexOf(openingTag.replace("<", "</"));
                cutLength = cutLength + nextClosingIndex;
                //console.log(openingTag, ' nextClose ', nextClosingIndex);
                //shifting the index of closing tag to the position where no other opening detected tag with same name is found
                indexClosingTag = cutLength + (openingTag.length + 1) * j;
                j++;
            }

            // account for case where additional information in the openning tag
            if (indexClosingTag == -1) {
                tagName = openingTag.match(/[^<][\w+$]*/)[0];
                indexClosingTag = xmlStr.indexOf(`</${tagName}`);
                if (indexClosingTag == -1) {
                    indexClosingTag = xmlStr.indexOf(`<\\/${tagName}`);
                }
            }
            inner_substring = xmlStr.substring(openingTag.length, indexClosingTag);
            if (template == "applymask" && tagName == "identifier") {
                template = "";
            }
            if (array_empty.includes(tagName) && inner_substring != "template") {
                if (template != "apllymask") {
                    template = tagName;
                }
            }
            if (tagName == "switch") {
                device = tagName;
            }
            if (tagName == "blind") {
                blind = tagName;
            }
            if (tagName == "simpleonoff") {
                onoff = tagName;
            }
            if (tagName == "powermeter" || tagName == "temperature") {
                statistic = tagName;
            }
            if (tagName == "functionbitmask" && inner_substring == "1") {
                mask = "1";
            } else if (tagName == "functionbitmask" && inner_substring == "524289") {
                mask = "1";
                inner_substring = "1";
            } else if (tagName == "functionbitmask" && inner_substring != "1") {
                mask = inner_substring;
                const masks = (inner_substring >>> 0).toString(2).split("").reverse().join("");
                if (masks.slice(17) == "1") {
                    control = "colorcontrol";
                }
            }
            if (tagName == "fwversion" && mask == "1") {
                fw = inner_substring;
            }
            if (inner_substring == "FRITZ!DECT 350" && mask == "1") {
                dect350 = inner_substring;
            }
            if (dect350 != "" && tagName == "name" && dect350_name == "") {
                dect350_name = inner_substring.toString();
            }
            if (dect350 != "" && tagName == "battery") {
                dect350_bat = parseInt(inner_substring);
            }
            if (dect350 != "" && tagName == "batterylow") {
                dect350_batlow = inner_substring;
            }
            if (inner_substring.match(/<[^/][^>]*>/)) {
                //no need for cleanXML again
                //tempVal = xml2json(inner_substring);
                tempVal = xml2jsonRecurse(inner_substring, true);
            } else {
                //console.log("PUSH: " + " - " + tagName + " - " + JSON.stringify(tempVal));
                //convert to number
                if (tagName == "levelpercentage" && blind == "blind") {
                    blind = "";
                    obj["blindstop"] = false;
                    obj["blindopen"] = false;
                    obj["blindclose"] = false;
                    if (inner_substring == "") {
                        tempVal = 0;
                    } else {
                        tempVal = inner_substring;
                    }
                    obj["blindlevel"] = 100 - tempVal;
                    obj["blindvalue"] = 100 - tempVal;
                }
                if (tagName == "name" && dect350 != "" && dect350_name != "" && dect350_is) {
                    inner_substring = dect350_name;
                    dect350_name = "";
                    dect350 = "";
                    dect350_is = false;
                }
                if (tagName == "identifier" && dect350 != "" && dect350_bat != -1) {
                    obj["battery"] = dect350_bat;
                    dect350_bat = -1;
                    dect350_is = true;
                }
                if (tagName == "identifier" && dect350 != "" && dect350_batlow != "") {
                    obj["batterylow"] = dect350_batlow == "1" ? true : false;
                    dect350_batlow = "";
                    dect350_is = true;
                }
                if (tagName == "celsius" && statistic == "temperature") {
                    statistic = "";
                    obj["getTemperatureStatistic"] = false;
                }
                if (tagName == "energy" && statistic == "powermeter") {
                    statistic = "";
                    obj["getStatistic"] = false;
                }
                if (tagName == "current_mode" && control == "colorcontrol") {
                    obj["getColor"] = false;
                }
                if (tagName == "state" && control == "colorcontrol" && onoff == "simpleonoff" && device != "switch") {
                    control = "";
                    onoff = "";
                    obj["stateonoff"] = inner_substring == "1" ? true : false;
                }
                if (array_empty.includes(template) && template_data.includes(tagName) && tagName != template) {
                    if (!obj[template]) {
                        obj[template] = [];
                    }
                    tempVal = tagName;
                    tagName = template;
                } else if (tagName == "fwversion" && fw != "" && mask != "1") {
                    tempVal = fw;
                    fw = "";
                } else if (tagName == "state" && device === "switch") {
                    device = "";
                    tempVal = inner_substring == "1" ? true : false;
                } else if (tagName == "state" && inner_substring == "") {
                    tempVal = 0;
                } else if (boolean_value.includes(tagName)) {
                    tempVal = inner_substring == "1" ? true : false;
                } else if (no_value.includes(tagName) && inner_substring == "") {
                    tempVal = -1;
                } else if (temp.includes(tagName) && inner_substring > "0") {
                    if (inner_substring == "253" || inner_substring == "254" || inner_substring == "255") {
                        tempVal = parseInt(inner_substring);
                    } else {
                        tempVal = parseInt(inner_substring) / 2;
                    }
                } else if (tagName == "celsius" && inner_substring.toString().length > 2) {
                    tempVal = parseInt(inner_substring) / 10;
                } else if (tagName == "voltage" && inner_substring > "0") {
                    tempVal = Math.round(parseInt(inner_substring) * 0.001);
                } else if (tagName == "power" && inner_substring > "0") {
                    tempVal = Math.round(parseInt(inner_substring) * 0.01);
                } else if (tagName == "manufacturer" || tagName == "fwversion" || tagName == "members") {
                    tempVal = inner_substring;
                } else if ((tagName == "level" || tagName == "levelpercentage") && inner_substring == "") {
                    tempVal = 0;
                } else if (json_empty.includes(tagName) && inner_substring == "") {
                    tempVal = {};
                } else if (array_empty.includes(tagName) && inner_substring == "") {
                    tempVal = [];
                } else if (tagName == "metadata" && inner_substring != "") {
                    tempVal = JSON.parse(inner_substring);
                } else {
                    tempVal =
                        parseInt(inner_substring) == inner_substring ? parseInt(inner_substring) : inner_substring;
                }
            }
            // account for array or obj //
            if (obj[tagName] === undefined) {
                if (tagName == "applymask" && tempVal.applymask) {
                    if (tempVal.applymask.sub_templates) {
                        obj[tagName] = ["sub_templates"];
                    } else {
                        obj[tagName] = tempVal.applymask;
                    }
                } else if (tagName == "devices" && tempVal.device) {
                    if (Array.isArray(tempVal.device)) {
                        obj[tagName] = tempVal.device;
                    } else {
                        const arr = [];
                        arr.push(tempVal.device);
                        obj[tagName] = arr;
                    }
                } else if (tagName == "sub_templates" && tempVal.template) {
                    if (Array.isArray(tempVal.template)) {
                        obj[tagName] = tempVal.template;
                    } else {
                        const arr = [];
                        arr.push(tempVal.template);
                        obj[tagName] = arr;
                    }
                } else if (tagName == "triggers" && tempVal.trigger) {
                    if (Array.isArray(tempVal.trigger)) {
                        obj[tagName] = tempVal.trigger;
                    } else {
                        const arr = [];
                        arr.push(tempVal.trigger);
                        obj[tagName] = arr;
                    }
                } else {
                    obj[tagName] = tempVal;
                }
                //console.log("UNDEFINED: " + " - " + tagName + " - " + JSON.stringify(tempVal));
            } else if (Array.isArray(obj[tagName])) {
                obj[tagName].push(tempVal);
                //console.log("PUSH: " + " - " + tagName + " - " + JSON.stringify(tempVal));
            } else {
                obj[tagName] = [obj[tagName], tempVal];
                //console.log("INSERT: " + " - " + tagName + " - " + JSON.stringify(tempVal));
            }

            xmlStr = xmlStr.substring(openingTag.length * 2 + 1 + inner_substring.length);
        }
    } catch {
        console.log(`ERROR: ${JSON.stringify(xmlStr)}`);
    }
    return obj;
}

//*****************************************************************
// Removes some characters that would break the recursive function.
//*****************************************************************
function cleanXML(xmlStr) {
    xmlStr = typeof xmlStr === "string" && xmlStr != "" ? xmlStr.replace(/&quot;/g, `"`) : xmlStr; //replace quot in metadata template
    xmlStr = typeof xmlStr === "string" && xmlStr != "" ? xmlStr.replace(/<!--[\s\S]*?-->/g, "") : xmlStr; //remove commented lines
    xmlStr = typeof xmlStr === "string" && xmlStr != "" ? xmlStr.replace(/\n|\t|\r/g, "") : xmlStr; //replace special characters
    xmlStr = typeof xmlStr === "string" && xmlStr != "" ? xmlStr.replace(/ {1,}<|\t{1,}</g, "<") : xmlStr; //replace leading spaces and tabs
    xmlStr = typeof xmlStr === "string" && xmlStr != "" ? xmlStr.replace(/> {1,}|>\t{1,}/g, ">") : xmlStr; //replace trailing spaces and tabs
    xmlStr = typeof xmlStr === "string" && xmlStr != "" ? xmlStr.replace(/<\?[^>]*\?>/g, "") : xmlStr; //delete docType tags
    xmlStr = replaceSelfClosingTags(xmlStr); //replace self closing tags
    xmlStr = replaceAloneValues(xmlStr); //replace the alone tags values
    xmlStr = replaceAttributes(xmlStr); //replace attributes
    return xmlStr;
}

//************************************************************************************************************
// Replaces all the self closing tags with attributes with another tag containing its attribute as a property.
// The function works if the tag contains multiple attributes.
//
// Example : '<tagName attrName="attrValue" />' becomes
//           '<tagName><attrName>attrValue</attrName></tagName>'
//************************************************************************************************************
function replaceSelfClosingTags(xmlStr) {
    const selfClosingTags = typeof xmlStr === "string" && xmlStr != "" ? xmlStr.match(/<[^/][^>]*\/>/g) : xmlStr;
    if (selfClosingTags) {
        for (let i = 0; i < selfClosingTags.length; i++) {
            const oldTag = selfClosingTags[i];
            let tempTag = oldTag.substring(0, oldTag.length - 2);
            tempTag += ">";

            const tagName = oldTag.match(/[^<][\w+$]*/)[0];
            const closingTag = `</${tagName}>`;
            let newTag = `<${tagName}>`;

            //beobachten was mit einstelligen Attributwerten passiert
            const attrs = tempTag.match(/(\S+)=["']?((?:.(?!["']?\s+(?:\S+)=|[>"']))+.)["']?/g);

            if (attrs) {
                for (let j = 0; j < attrs.length; j++) {
                    const attr = attrs[j];
                    const attrName = attr.substring(0, attr.indexOf("="));
                    const attrValue = attr.substring(attr.indexOf('"') + 1, attr.lastIndexOf('"'));

                    newTag += `<${attrName}>${attrValue}</${attrName}>`;
                }
            }

            newTag += closingTag;
            xmlStr = xmlStr.replace(oldTag, newTag);
        }
    }

    return xmlStr;
}

//*************************************************************************************************
// Replaces all the tags with attributes and a value with a new tag.
//
// Example : '<tagName attrName="attrValue">tagValue</tagName>' becomes
//           '<tagName><attrName>attrValue</attrName><_@attribute>tagValue</_@attribute></tagName>'
//*************************************************************************************************
function replaceAloneValues(xmlStr) {
    const tagsWithAttributesAndValue =
        typeof xmlStr === "string" && xmlStr != ""
            ? xmlStr.match(/<[^/][^>][^<]+\s+.[^<]+[=][^<]+>{1}([^<]+)/g)
            : xmlStr;

    if (tagsWithAttributesAndValue) {
        for (let i = 0; i < tagsWithAttributesAndValue.length; i++) {
            const oldTag = tagsWithAttributesAndValue[i];
            const oldTagName = oldTag.substring(0, oldTag.indexOf(">") + 1);
            const oldTagValue = oldTag.substring(oldTag.indexOf(">") + 1);
            const newTag = `${oldTagName}<_@attribute>${oldTagValue}</_@attribute>`;
            xmlStr = xmlStr.replace(oldTag, newTag);
        }
    }

    return xmlStr;
}

//*****************************************************************************************************************
// Replaces all the tags with attributes with another tag containing its attribute as a property.
// The function works if the tag contains multiple attributes.
//
// Example : '<tagName attrName="attrValue"></tagName>' becomes '<tagName><attrName>attrValue</attrName></tagName>'
//*****************************************************************************************************************
function replaceAttributes(xmlStr) {
    // the following line doesnt catch 2 digit tags
    //const tagsWithAttributes = xmlStr.match(/<[^\/][^>][^<]+\s+.[^<]+[=][^<]+>/g);
    // 2 digits tags are catched
    const tagsWithAttributes =
        typeof xmlStr === "string" && xmlStr != "" ? xmlStr.match(/<[^>][^<]+\s+.[^<]+[=][^<]+>/g) : xmlStr;
    if (tagsWithAttributes) {
        for (let i = 0; i < tagsWithAttributes.length; i++) {
            const oldTag = tagsWithAttributes[i];
            const tagName = oldTag.match(/[^<][\w+$]*/)[0];
            let newTag = `<${tagName}>`;
            const attrs = oldTag.match(/(\S+)=["']?((?:.(?!["']?\s+(?:\S+)=|[>"']))+.)["']?/g);
            if (attrs) {
                for (let j = 0; j < attrs.length; j++) {
                    const attr = attrs[j];
                    const attrName = attr.substring(0, attr.indexOf("="));
                    const attrValue = attr.substring(attr.indexOf('"') + 1, attr.lastIndexOf('"'));
                    newTag += `<${attrName}>${attrValue}</${attrName}>`;
                }
            }
            xmlStr = xmlStr.replace(oldTag, newTag);
        }
    }

    return xmlStr;
}
