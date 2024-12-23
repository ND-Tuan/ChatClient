const crypto = require('crypto');
const { subtle } = crypto.webcrypto;

// Mã hóa tin nhắn bằng khóa công khai RSA
async function encryptMessage(message, publicKey) {
    const importedKey = await subtle.importKey(
        'spki',
        Buffer.from(publicKey, 'base64'),
        { name: 'RSA-OAEP', hash: 'SHA-256' },
        false,
        ['encrypt']
    );

    const encrypted = await subtle.encrypt(
        { name: 'RSA-OAEP' },
        importedKey,
        Buffer.from(message)
    );

    return Buffer.from(encrypted).toString('base64');
}

// Giải mã tin nhắn bằng khóa bí mật RSA
async function decryptMessage(ciphertext, privateKey) {
    const decrypted = await subtle.decrypt(
        { name: 'RSA-OAEP' },
        privateKey,
        Buffer.from(ciphertext, 'base64')
    );

    return new TextDecoder().decode(decrypted);
}

module.exports = { encryptMessage, decryptMessage };
