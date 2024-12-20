'use strict'

/** ******* Imports ********/
const { webcrypto: crypto } = require('crypto')
const { subtle } = crypto

const {
  /* The following functions are all of the cryptographic
  primatives that you should need for this assignment.
  See lib.js for details on usage. */
  bufferToString,
  genRandomSalt,
  generateEG, // async
  computeDH, // async
  verifyWithECDSA, // async
  HMACtoAESKey, // async
  HMACtoHMACKey, // async
  HKDF, // async
  encryptWithGCM, // async
  decryptWithGCM,
  cryptoKeyToJSON, // async
  govEncryptionDataStr
} = require('./lib')

/** ******* Implementation ********/

class MessengerClient {
  constructor (certAuthorityPublicKey, govPublicKey) {
    // the certificate authority DSA public key is used to
    // verify the authenticity and integrity of certificates
    // of other users (see handout and receiveCertificate)

    // you can store data as needed in these objects.
    // Feel free to modify their structure as you see fit.
    this.caPublicKey = certAuthorityPublicKey
    this.govPublicKey = govPublicKey
    this.conns = {} // data for each active connection
    this.certs = {} // certificates of other users
    this.EGKeyPair = {} // keypair from generateCertificate
    this.receivedMessages = new Map()
  }

  /**
   * Generate a certificate to be stored with the certificate authority.
   * The certificate must contain the field "username".
   *
   * Arguments:
   *   username: string
   *
   * Return Type: certificate object/dictionary
   */

  async generateCertificate (username) {
    const certificate = {};
		certificate.username = username;
    this.EGKeyPair = await generateEG()
    certificate.pubKey = await cryptoKeyToJSON(this.EGKeyPair.pub)
    return certificate
  }

  /**
   * Receive and store another user's certificate.
   *
   * Arguments:
   *   certificate: certificate object/dictionary
   *   signature: ArrayBuffer
   *
   * Return Type: void
   */

  async receiveCertificate (certificate, signature) {
    const isValid = await verifyWithECDSA(this.caPublicKey, JSON.stringify(certificate), signature)
    if (!isValid) {
      throw new Error('Invalid certificate signature')
    }
    this.certs[certificate.username] = certificate
  }

  /**
   * Generate the message to be sent to another user.
   *
   * Arguments:
   *   name: string
   *   plaintext: string
   *
   * Return Type: Tuple of [dictionary, ArrayBuffer]
   */
  async sendMessage (name, plaintext) {
    if (!this.certs[name]) {
      throw new Error(`Certificate for user ${name} does not exist.`)
    }
    const recipientCert = this.certs[name]

    const recipientPublicKey = await subtle.importKey(
      'jwk',
      recipientCert.pubKey,
      { name: 'ECDH', namedCurve: 'P-384' },
      true,
      []
    )

    // Import government public key
    const vGovKeyJWK = await cryptoKeyToJSON(this.govPublicKey)
    const vGovKey = await subtle.importKey(
      'jwk',
      vGovKeyJWK,
      { name: 'ECDH', namedCurve: 'P-384' },
      true,
      []
    )
    // console.debug('vGovKey', vGovKeyJWK, vGovKey)

    // Import own public key for session key of encryption
    const vGovJWK = await cryptoKeyToJSON(this.EGKeyPair.pub)
    const vGov = await subtle.importKey(
      'jwk',
      vGovJWK,
      { name: 'ECDH', namedCurve: 'P-384' },
      true,
      []
    )

    // Encrypt with government key
    const ivGov = genRandomSalt(12)
    let govKey = await computeDH(this.EGKeyPair.sec, vGovKey)
    govKey = await HMACtoAESKey(govKey, govEncryptionDataStr)
    const govKeyBuffer = await subtle.exportKey('raw', govKey)
    const cGov = await encryptWithGCM(govKey, govKeyBuffer, ivGov)

    // Encrypt message
    const sharedSecret = await computeDH(this.EGKeyPair.sec, recipientPublicKey)
    const aesKey = await HMACtoAESKey(sharedSecret, govEncryptionDataStr)
    const iv = genRandomSalt(12)
    const ciphertext = await encryptWithGCM(aesKey, plaintext, iv)

    // Encrypt message for government
    const ctinGOV = await encryptWithGCM(govKey, plaintext, iv)

    const header = {
      iv,
      sender: JSON.stringify(await cryptoKeyToJSON(this.EGKeyPair.pub)),
      cGov,
      vGov,
      ivGov,
      receiverIV: iv,
      timestamp: Date.now()
    }
    return [header, ciphertext, ctinGOV]
  }

  /**
   * Decrypt a message received from another user.
   *
   * Arguments:
   *   name: string
   *   [header, ciphertext]: Tuple of [dictionary, ArrayBuffer]
   *
   * Return Type: string
   */
  async receiveMessage (name, [header, ciphertext, ctinGOV]) {
    const senderCert = this.certs[name]
    if (!senderCert) {
      throw new Error('Sender certificate not found')
    }

    // Detect replay attacks
    const messageId = `${header.sender}-${header.iv}-${header.timestamp}`
    const currentTime = Date.now()
    const oneYearInMillis = 7 * 24 * 60 * 60 * 1000

    // Clean up old messages
    for (const [id, timestamp] of this.receivedMessages) {
      if (currentTime - timestamp > oneYearInMillis) {
        this.receivedMessages.delete(id)
      }
    }

    if (this.receivedMessages.has(messageId)) {
      throw new Error('Replay attack detected')
    }
    this.receivedMessages.set(messageId, currentTime)

    // Import sender public key
    const senderPubKey = await subtle.importKey(
      'jwk',
      senderCert.pubKey,
      { name: 'ECDH', namedCurve: 'P-384' },
      true,
      []
    )

    const sharedSecret = await computeDH(this.EGKeyPair.sec, senderPubKey)
    const aesKey = await HMACtoAESKey(sharedSecret, govEncryptionDataStr)

    const plaintextBuffer = await decryptWithGCM(aesKey, ciphertext, header.iv)
    const plaintext = bufferToString(plaintextBuffer)

    return plaintext
  }
};

module.exports = {
  MessengerClient
}
