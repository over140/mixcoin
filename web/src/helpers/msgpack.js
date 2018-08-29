function Msgpack() {

}

Msgpack.prototype = {
  decodeArray: function (uuidParse, buf, offset, length, headerLength) {
    var result = []
    var i
    var totalBytesConsumed = 0

    offset += headerLength
    for (i = 0; i < length; i++) {
      var decodeResult = this.tryDecode(uuidParse, buf, offset)
      if (decodeResult) {
        result.push(decodeResult.value)
        offset += decodeResult.length
        totalBytesConsumed += decodeResult.length
      } else {
        return null
      }
    }
    return { value: uuidParse.unparse(result), length: headerLength + totalBytesConsumed }
  },

  getSize: function (first) {
    switch (first) {
      case 0xc4:
        return 2
      case 0xc5:
        return 3
      case 0xc6:
        return 5
      case 0xc7:
        return 3
      case 0xc8:
        return 4
      case 0xc9:
        return 6
      case 0xca:
        return 5
      case 0xcb:
        return 9
      case 0xcc:
        return 2
      case 0xcd:
        return 3
      case 0xce:
        return 5
      case 0xcf:
        return 9
      case 0xd0:
        return 2
      case 0xd1:
        return 3
      case 0xd2:
        return 5
      case 0xd3:
        return 9
      case 0xd4:
        return 3
      case 0xd5:
        return 4
      case 0xd6:
        return 6
      case 0xd7:
        return 10
      case 0xd8:
        return 18
      case 0xd9:
        return 2
      case 0xda:
        return 3
      case 0xdb:
        return 5
      case 0xde:
        return 3
      default:
        return -1
    }
  },

  hasMinBufferSize: function (first, length) {
    var size = this.getSize(first)

    if (size !== -1 && length < size) {
      return false
    } else {
      return true
    }
  },

  tryDecode: function (uuidParse, buf, offset) {
    offset = offset === undefined ? 0 : offset
    var bufLength = buf.length - offset
    if (bufLength <= 0) {
      return null;
    }

    var type = buf.readUInt8(offset);
    if (!this.hasMinBufferSize(type, bufLength)) {
      return null
    }

    switch (type) {
      case 0xc0:
      return { value: null, length: 1 };
      case 0xc2:
        return { value: false, length: 1 };
      case 0xc3:
        return { value: true, length: 1 };
      case 0xcc:  // 1-byte unsigned int
        return { value: buf.readUInt8(offset + 1), length: 2 };
      case 0xcd:  // 2-bytes BE unsigned int
        return { value: buf.readUInt16BE(offset + 1), length: 3 };
      case 0xce:  // 4-bytes BE unsigned int
        return { value: buf.readUInt32BE(offset + 1), length: 5 };
      case 0xd0:  // 1-byte signed int
        return { value: buf.readInt8(offset + 1), length: 2 };
      case 0xd1:
        return { value: buf.readInt16BE(offset + 1), length: 3 };
      case 0xd2:
        return { value: buf.readInt32BE(offset + 1), length: 5 };
      case 0xd9:  // strings up to 2^8 - 1 bytes
        length = buf.readUInt8(offset + 1);
        return { value: buf.toString('utf8', offset + 2, offset + 2 + length), length: length };
      case 0xda:  // strings up to 2^16 - 2 bytes
        length = buf.readUInt16BE(offset + 1)
        return { value: buf.toString('utf8', offset + 3, offset + 3 + length), length: length };
      case 0xdb:  // strings up to 2^32 - 4 bytes
        length = buf.readUInt32BE(offset + 1);
        return { value: buf.toString('utf8', offset + 5, offset + 5 + length), length: length };
      case 0xdc:
        length = buf.readUInt16BE(offset + 1)
        return this.decodeArray(uuidParse, buf, offset, length, 3);
      case 0xb0:
        length = buf.readUInt16BE(offset + 1);
        return { value: uuidParse.unparse(buf.slice(offset + 1, offset + 1 + 16)), length: 16 + 1 };
      default:
        if ((type & 0xf0) === 0x90) {
          length = type & 0x0f;
          return this.decodeArray(uuidParse, buf, offset, length, 1);
        } else if ((type & 0xf0) === 0x80) {
          length = type & 0x0f;
          return this.decodeMap(uuidParse, buf, offset, length, 1);
        } else if ((type & 0xe0) === 0xa0) {
          length = type & 0x1f
          return { value: buf.toString('utf8', offset + 1, offset + length + 1), length: length + 1 };
        } else if (type >= 0xe0) {
          return { value: type - 0x100, length: 1 };
        } else if (type < 0x80) {
          return { value: type, length: 1 };
        }
        break;
    }
    return null;
  },

  decodeMap: function (buf, offset, length, headerLength) {
    var result = {};
    offset += headerLength;

    const uuidParse = require('uuid-parse');

    for (var i = 0; i < length; i++) {
      const key = this.tryDecode(uuidParse, buf, offset);
      if (key) {
        offset += key.length;
        const value = this.tryDecode(uuidParse, buf, offset);
        if (value) {
          result[key.value] = value.value;
          offset += value.length;
        }
      }
    }

    return result
  }
};

export default Msgpack;