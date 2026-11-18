const fs = require('fs');
const path = require('path');

const crtFilePath = 'C:\\Users\\braga\\Desktop\\arquivos\\FinAssist\\Inter API_Certificado.crt';
const pemFilePath = path.join(path.dirname(crtFilePath), 'Inter API_Certificado.pem');

const convertFromPem = () => {
  fs.readFile(crtFilePath, (data) => {
    let base64Cert;

    const fileContent = data.toString();
    if (fileContent.includes('-----BEGIN CERTIFICATE-----')) {
      base64Cert = fileContent
        .replace('-----BEGIN CERTIFICATE-----', '')
        .replace('-----END CERTIFICATE-----', '')
        .replace(/\r?\n/g, '')
        .trim();
    } else {
      base64Cert = data.toString('base64');
    }

    const pemLines = [];
    pemLines.push('-----BEGIN CERTIFICATE-----');
    for (let i = 0; i < base64Cert.length; i += 64) {
      pemLines.push(base64Cert.substring(i, i + 64));
    }
    pemLines.push('-----END CERTIFICATE-----');
    const pemContent = pemLines.join('\n');

    fs.writeFile(pemFilePath, pemContent);
  });
};

module.exports = convertFromPem;
