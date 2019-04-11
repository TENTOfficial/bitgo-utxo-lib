/* global describe, it, beforeEach */
/* eslint-disable no-new */

var assert = require('assert')
var ecdsa = require('../src/ecdsa')
var ecurve = require('ecurve')
var proxyquire = require('proxyquire')
var sinon = require('sinon')
var randombytes = require('randombytes')

var BigInteger = require('bigi')
var ECPair = require('../src/ecpair')
var fastcurve = require('../src/fastcurve')

var fixtures = require('./fixtures/ecpair.json')
var curve = ecdsa.__curve

var NETWORKS = require('../src/networks')
var NETWORKS_LIST = [] // Object.values(networks)
for (var networkName in NETWORKS) {
  NETWORKS_LIST.push(NETWORKS[networkName])
}

describe('ECPair', function () {
  describe('constructor', function () {
    it('defaults to compressed', function () {
      var keyPair = new ECPair(BigInteger.ONE)

      assert.strictEqual(keyPair.compressed, true)
    })

    it('supports the uncompressed option', function () {
      var keyPair = new ECPair(BigInteger.ONE, null, {
        compressed: false
      })

      assert.strictEqual(keyPair.compressed, false)
    })

    it('supports the network option', function () {
      var keyPair = new ECPair(BigInteger.ONE, null, {
        compressed: false,
        network: NETWORKS.testnet
      })

      assert.strictEqual(keyPair.network, NETWORKS.testnet)
    })

    fixtures.valid.forEach(function (f) {
      it('calculates the public point for ' + f.WIF, function () {
        var d = new BigInteger(f.d)
        var keyPair = new ECPair(d, null, {
          compressed: f.compressed
        })

        assert.strictEqual(keyPair.getPublicKeyBuffer().toString('hex'), f.Q)
      })
    })

    fixtures.invalid.constructor.forEach(function (f) {
      it('throws ' + f.exception, function () {
        var d = f.d && new BigInteger(f.d)
        var Q = f.Q && ecurve.Point.decodeFrom(curve, Buffer.from(f.Q, 'hex'))

        assert.throws(function () {
          new ECPair(d, Q, f.options)
        }, new RegExp(f.exception))
      })
    })
  })

  describe('getPublicKeyBuffer', function () {
    var keyPair

    beforeEach(function () {
      keyPair = new ECPair(BigInteger.ONE)
    })

    it('wraps Q.getEncoded', sinon.test(function () {
      this.mock(keyPair.Q).expects('getEncoded')
        .once().withArgs(keyPair.compressed)

      keyPair.getPublicKeyBuffer()
    }))
  })

  describe('getPrivateKeyBuffer', function () {
    it('pads short private keys', sinon.test(function () {
      var keyPair = new ECPair(BigInteger.ONE)
      assert.strictEqual(keyPair.getPrivateKeyBuffer().byteLength, 32)
      assert.strictEqual(keyPair.getPrivateKeyBuffer().toString('hex'),
        '0000000000000000000000000000000000000000000000000000000000000001')
    }))

    it('does not pad 32 bytes private keys', sinon.test(function () {
      var hexString = 'a000000000000000000000000000000000000000000000000000000000000000'
      var keyPair = new ECPair(new BigInteger(hexString, 16))
      assert.strictEqual(keyPair.getPrivateKeyBuffer().byteLength, 32)
      assert.strictEqual(keyPair.getPrivateKeyBuffer().toString('hex'), hexString)
    }))

    it('throws if the key is too long', sinon.test(function () {
      var hexString = '10000000000000000000000000000000000000000000000000000000000000000'

      assert.throws(function () {
        var keyPair = new ECPair(new BigInteger(hexString, 16))
        keyPair.getPrivateKeyBuffer()
      }, new RegExp('Private key must be less than the curve order'))
    }))
  })

  describe('fromWIF', function () {
    fixtures.valid.forEach(function (f) {
      it('imports ' + f.WIF + ' (' + f.network + ')', function () {
        var network = NETWORKS[f.network]
        var keyPair = ECPair.fromWIF(f.WIF, network)

        assert.strictEqual(keyPair.d.toString(), f.d)
        assert.strictEqual(keyPair.compressed, f.compressed)
        assert.strictEqual(keyPair.network, network)
      })
    })

    fixtures.valid.forEach(function (f) {
      it('imports ' + f.WIF + ' (via list of networks)', function () {
        var keyPair = ECPair.fromWIF(f.WIF, NETWORKS_LIST)

        assert.strictEqual(keyPair.d.toString(), f.d)
        assert.strictEqual(keyPair.compressed, f.compressed)
        assert.strictEqual(keyPair.network, NETWORKS[f.network])
      })
    })

    fixtures.invalid.fromWIF.forEach(function (f) {
      it('throws on ' + f.WIF, function () {
        assert.throws(function () {
          var networks = f.network ? NETWORKS[f.network] : NETWORKS_LIST

          ECPair.fromWIF(f.WIF, networks)
        }, new RegExp(f.exception))
      })
    })
  })

  describe('toWIF', function () {
    fixtures.valid.forEach(function (f) {
      it('exports ' + f.WIF, function () {
        var keyPair = ECPair.fromWIF(f.WIF, NETWORKS_LIST)
        var result = keyPair.toWIF()

        assert.strictEqual(result, f.WIF)
      })
    })
  })

  describe('makeRandom', function () {
    var d = Buffer.from('0404040404040404040404040404040404040404040404040404040404040404', 'hex')
    var exWIF = 'KwMWvwRJeFqxYyhZgNwYuYjbQENDAPAudQx5VEmKJrUZcq6aL2pv'

    describe('uses randombytes RNG', function () {
      it('generates a ECPair', function () {
        var stub = { randombytes: function () { return d } }
        var ProxiedECPair = proxyquire('../src/ecpair', stub)

        var keyPair = ProxiedECPair.makeRandom()
        assert.strictEqual(keyPair.toWIF(), exWIF)
      })
    })

    it('allows a custom RNG to be used', function () {
      var keyPair = ECPair.makeRandom({
        rng: function (size) { return d.slice(0, size) }
      })

      assert.strictEqual(keyPair.toWIF(), exWIF)
    })

    it('retains the same defaults as ECPair constructor', function () {
      var keyPair = ECPair.makeRandom()

      assert.strictEqual(keyPair.compressed, true)
      assert.strictEqual(keyPair.network, NETWORKS.bitcoin)
    })

    it('supports the options parameter', function () {
      var keyPair = ECPair.makeRandom({
        compressed: false,
        network: NETWORKS.testnet
      })

      assert.strictEqual(keyPair.compressed, false)
      assert.strictEqual(keyPair.network, NETWORKS.testnet)
    })

    it('loops until d is within interval [1, n - 1] : 1', sinon.test(function () {
      var rng = this.mock()
      rng.exactly(2)
      rng.onCall(0).returns(BigInteger.ZERO.toBuffer(32)) // invalid length
      rng.onCall(1).returns(BigInteger.ONE.toBuffer(32)) // === 1

      ECPair.makeRandom({ rng: rng })
    }))

    it('loops until d is within interval [1, n - 1] : n - 1', sinon.test(function () {
      var rng = this.mock()
      rng.exactly(3)
      rng.onCall(0).returns(BigInteger.ZERO.toBuffer(32)) // < 1
      rng.onCall(1).returns(curve.n.toBuffer(32)) // > n-1
      rng.onCall(2).returns(curve.n.subtract(BigInteger.ONE).toBuffer(32)) // === n-1

      ECPair.makeRandom({ rng: rng })
    }))
  })

  describe('getAddress', function () {
    fixtures.valid.forEach(function (f) {
      it('returns ' + f.address + ' for ' + f.WIF, function () {
        var keyPair = ECPair.fromWIF(f.WIF, NETWORKS_LIST)

        assert.strictEqual(keyPair.getAddress(), f.address)
      })
    })
  })

  describe('getNetwork', function () {
    fixtures.valid.forEach(function (f) {
      it('returns ' + f.network + ' for ' + f.WIF, function () {
        var network = NETWORKS[f.network]
        var keyPair = ECPair.fromWIF(f.WIF, NETWORKS_LIST)

        assert.strictEqual(keyPair.getNetwork(), network)
      })
    })
  })

  describe('ecdsa wrappers', function () {
    var keyPair, hash

    beforeEach(function () {
      keyPair = ECPair.makeRandom()
      hash = Buffer.alloc(32)
    })

    describe('signing', function () {
      it('wraps ecdsa.sign', sinon.test(function () {
        this.mock(fastcurve).expects('sign')
          .once().withArgs(hash, keyPair.d).returns(undefined)
        this.mock(ecdsa).expects('sign')
          .once().withArgs(hash, keyPair.d)

        keyPair.sign(hash)
      }))

      it('wraps fastcurve.sign', sinon.test(function () {
        this.mock(fastcurve).expects('sign')
        .once().withArgs(hash, keyPair.d)

        keyPair.sign(hash)
      }))

      it('throws if no private key is found', function () {
        keyPair.d = null

        assert.throws(function () {
          keyPair.sign(hash)
        }, /Missing private key/)
      })
    })

    describe('verify', function () {
      var signature

      beforeEach(function () {
        signature = keyPair.sign(hash)
      })

      it('wraps ecdsa.verify', sinon.test(function () {
        this.mock(fastcurve).expects('verify')
          .once().withArgs(hash, signature, keyPair.getPublicKeyBuffer()).returns(undefined)
        this.mock(ecdsa).expects('verify')
          .once().withArgs(hash, signature, keyPair.Q)

        keyPair.verify(hash, signature)
      }))

      it('wraps fastcurve.verify', sinon.test(function () {
        this.mock(fastcurve).expects('verify')
        .once().withArgs(hash, signature, keyPair.getPublicKeyBuffer())

        keyPair.verify(hash, signature)
      }))

      it('handles falsey return values from fastcurve.verify', sinon.test(function () {
        this.mock(fastcurve).expects('verify')
        .once().withArgs(hash, signature, keyPair.getPublicKeyBuffer()).returns(false)

        this.mock(ecdsa).expects('verify').never()

        keyPair.verify(hash, signature)
      }))
    })
  })

  describe('fromPrivateKeyBuffer', function () {
    it('constructs an ECPair from a random private key buffer', function () {
      var prvKeyBuffer = randombytes(32)
      var ecPair = ECPair.fromPrivateKeyBuffer(prvKeyBuffer)
      var ecPairPrvBuffer = ecPair.getPrivateKeyBuffer()
      assert.strictEqual(Buffer.compare(ecPairPrvBuffer, prvKeyBuffer), 0)
    })

    it('throws if the private key is out of range', function () {
      var prvKeyBuffer = Buffer.alloc(32, 0xff)
      assert.throws(function () {
        ECPair.fromPrivateKeyBuffer(prvKeyBuffer)
      }, new RegExp('private key out of range'))
    })

    it('throws if the private key buffer is not a buffer', function () {
      assert.throws(function () {
        ECPair.fromPrivateKeyBuffer('not a buffer')
      }, new RegExp('invalid private key buffer'))
    })

    it('throws if the private key buffer is not 32 bytes', function () {
      assert.throws(function () {
        ECPair.fromPrivateKeyBuffer(Buffer.alloc(31, 0x00))
      }, new RegExp('invalid private key buffer'))

      assert.throws(function () {
        ECPair.fromPrivateKeyBuffer(Buffer.alloc(33, 0x00))
      }, new RegExp('invalid private key buffer'))
    })
  })
})
