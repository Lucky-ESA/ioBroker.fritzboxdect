const axios = require("axios");
const crypto = require("crypto");
const https = require("https");
const httpsAgent = new https.Agent({
    rejectUnauthorized: false,
});
let count = 0;

module.exports = async function (options) {
    const data = {};
    if (options.protocol === "https") {
        data.httpsAgent = httpsAgent;
    }
    data.baseURL = `${options.protocol}://${options.ip}:49000`;
    const requestClient = axios.create({
        withCredentials: true,
        timeout: 5000,
        headers: { "Content-Type": 'text/xml; charset="utf-8"', ...options.header },
        ...data,
    });
    const resp = await requestClient({
        method: options.method,
        url: options.url,
        data: options.data,
    })
        .then(async res => {
            if (res.data) {
                return res.data;
            }
            return res;
        })
        .catch(async err => {
            if (err.response && err.response.status === 401) {
                const authDetails = err.response.headers["www-authenticate"].split(",").map(v => v.split("="));
                ++count;
                const nonceCount = `00000000${count}`.slice(-8);
                const cnonce = crypto.randomBytes(24).toString("hex");
                const realm = authDetails[0][1].replace(/"/g, "");
                const nonce = authDetails[1][1].replace(/"/g, "");
                const md5 = str => crypto.createHash("md5").update(str).digest("hex");
                const HA1 = md5(`${options.publicKey}:${realm}:${options.privateKey}`);
                const HA2 = md5(`${options.method}:${options.url}`);
                const response = md5(`${HA1}:${nonce}:${nonceCount}:${cnonce}:auth:${HA2}`);
                const authorization =
                    `Digest username="${options.publicKey}",realm="${realm}",` +
                    `nonce="${nonce}",uri="${options.url}",qop="auth",algorithm="MD5",` +
                    `response="${response}",nc="${nonceCount}",cnonce="${cnonce}"`;
                const nextrequestClient = axios.create({
                    withCredentials: true,
                    timeout: 5000,
                    headers: { "Content-Type": 'text/xml; charset="utf-8"', ...options.header, authorization },
                    ...data,
                });
                return await nextrequestClient({
                    method: options.method,
                    url: options.url,
                    data: options.data,
                })
                    .then(async res => {
                        if (res.data) {
                            return res.data;
                        }
                        return res;
                    })
                    .catch(err => {
                        return err;
                    });
            }
            return err;
        });
    return resp;
};
