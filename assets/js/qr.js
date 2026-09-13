/* =========================================================================
   Nutri&Live — Minimal QR Code encoder (byte mode)
   Self-contained, no dependencies. Produces a real, scannable matrix.
   Algorithm follows ISO/IEC 18004. Adapted from the public-domain
   reference design by Project Nayuki, reimplemented compactly.
   ========================================================================= */
(function (global) {
  "use strict";

  var ECC = { L: 0, M: 1, Q: 2, H: 3 };
  var ECC_FORMAT_BITS = { 0: 1, 1: 0, 2: 3, 3: 2 };

  // ECC codewords per block, indexed [eccLevel][version]
  var ECC_CODEWORDS_PER_BLOCK = [
    // 0  1   2   3   4   5   6   7   8   9  10  11  12  13  ... version 1..40
    [null, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30], // L
    [null, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28], // M
    [null, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30], // Q
    [null, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30]  // H
  ];

  var NUM_ERROR_CORRECTION_BLOCKS = [
    [null, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
    [null, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
    [null, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
    [null, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 57, 60, 63, 66, 70, 74, 77, 81, 84]
  ];

  function getNumRawDataModules(ver) {
    var result = (16 * ver + 128) * ver + 64;
    if (ver >= 2) {
      var numAlign = Math.floor(ver / 7) + 2;
      result -= (25 * numAlign - 10) * numAlign - 55;
      if (ver >= 7) result -= 36;
    }
    return result;
  }
  function getNumDataCodewords(ver, ecl) {
    return Math.floor(getNumRawDataModules(ver) / 8)
      - ECC_CODEWORDS_PER_BLOCK[ecl][ver] * NUM_ERROR_CORRECTION_BLOCKS[ecl][ver];
  }

  /* ---------- Reed-Solomon over GF(256), primitive poly 0x11D ---------- */
  function rsMultiply(x, y) {
    var z = 0;
    for (var i = 7; i >= 0; i--) {
      z = ((z << 1) ^ ((z >>> 7) * 0x11D)) & 0xFF;
      z ^= ((y >>> i) & 1) * x;
    }
    return z;
  }
  function rsDivisor(degree) {
    var result = [];
    for (var i = 0; i < degree - 1; i++) result.push(0);
    result.push(1);
    var root = 1;
    for (var j = 0; j < degree; j++) {
      for (var k = 0; k < result.length; k++) {
        result[k] = rsMultiply(result[k], root);
        if (k + 1 < result.length) result[k] ^= result[k + 1];
      }
      root = rsMultiply(root, 0x02);
    }
    return result;
  }
  function rsRemainder(data, divisor) {
    var result = divisor.map(function () { return 0; });
    data.forEach(function (b) {
      var factor = b ^ result.shift();
      result.push(0);
      divisor.forEach(function (d, i) { result[i] ^= rsMultiply(d, factor); });
    });
    return result;
  }

  /* ---------- UTF-8 bytes ---------- */
  function toUtf8(str) {
    var out = [];
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) { out.push(0xC0 | (c >> 6), 0x80 | (c & 0x3F)); }
      else if (c >= 0xD800 && c < 0xDC00 && i + 1 < str.length) {
        var cp = 0x10000 + ((c - 0xD800) << 10) + (str.charCodeAt(++i) - 0xDC00);
        out.push(0xF0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3F), 0x80 | ((cp >> 6) & 0x3F), 0x80 | (cp & 0x3F));
      } else { out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 0x3F), 0x80 | (c & 0x3F)); }
    }
    return out;
  }

  /* ---------- Encoder ---------- */
  function encode(text, eclName) {
    var ecl = ECC[eclName || "M"];
    var data = toUtf8(text);
    var version = 0;
    for (var v = 1; v <= 40; v++) {
      var cap = getNumDataCodewords(v, ecl) * 8;
      var ccBits = v <= 9 ? 8 : 16;
      if (4 + ccBits + data.length * 8 <= cap) { version = v; break; }
    }
    if (!version) throw new Error("QR: data too long");

    // Bit stream
    var bits = [];
    function append(val, len) { for (var i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); }
    append(4, 4);                                  // byte mode
    append(data.length, version <= 9 ? 8 : 16);    // char count
    data.forEach(function (b) { append(b, 8); });

    var dataCapacityBits = getNumDataCodewords(version, ecl) * 8;
    append(0, Math.min(4, dataCapacityBits - bits.length));
    append(0, (8 - bits.length % 8) % 8);
    for (var pad = 0xEC; bits.length < dataCapacityBits; pad ^= 0xEC ^ 0x11) append(pad, 8);

    var dataCodewords = [];
    for (var i = 0; i < bits.length; i += 8) {
      var byte = 0;
      for (var j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
      dataCodewords.push(byte);
    }

    // Interleave with ECC
    var numBlocks = NUM_ERROR_CORRECTION_BLOCKS[ecl][version];
    var blockEccLen = ECC_CODEWORDS_PER_BLOCK[ecl][version];
    var rawCodewords = Math.floor(getNumRawDataModules(version) / 8);
    var numShortBlocks = numBlocks - rawCodewords % numBlocks;
    var shortBlockLen = Math.floor(rawCodewords / numBlocks);

    var blocks = [], rsDiv = rsDivisor(blockEccLen), k = 0;
    for (var b = 0; b < numBlocks; b++) {
      var len = shortBlockLen - blockEccLen + (b < numShortBlocks ? 0 : 1);
      var dat = dataCodewords.slice(k, k + len); k += len;
      var ecc = rsRemainder(dat, rsDiv);
      // Short blocks carry a placeholder so every block has the same length;
      // the placeholder is skipped again during interleaving.
      if (b < numShortBlocks) dat = dat.concat([0]);
      blocks.push(dat.concat(ecc));
    }
    var result = [];
    for (var i2 = 0; i2 < blocks[0].length; i2++) {
      for (var b2 = 0; b2 < blocks.length; b2++) {
        if (i2 !== shortBlockLen - blockEccLen || b2 >= numShortBlocks) {
          result.push(blocks[b2][i2]);
        }
      }
    }

    return drawMatrix(version, ecl, result);
  }

  function drawMatrix(version, ecl, allCodewords) {
    var size = version * 4 + 17;
    var modules = [], isFunction = [];
    for (var y = 0; y < size; y++) {
      modules.push(new Array(size).fill(false));
      isFunction.push(new Array(size).fill(false));
    }
    function setFn(x, y, val) {
      if (x < 0 || y < 0 || x >= size || y >= size) return;
      modules[y][x] = val; isFunction[y][x] = true;
    }
    // Timing patterns
    for (var i = 0; i < size; i++) { setFn(6, i, i % 2 === 0); setFn(i, 6, i % 2 === 0); }
    // Finders
    function finder(cx, cy) {
      for (var dy = -4; dy <= 4; dy++) for (var dx = -4; dx <= 4; dx++) {
        var dist = Math.max(Math.abs(dx), Math.abs(dy));
        setFn(cx + dx, cy + dy, dist !== 2 && dist !== 4);
      }
    }
    finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
    // Alignment
    var alignPos = [];
    if (version > 1) {
      var num = Math.floor(version / 7) + 2;
      var step = version === 32 ? 26 : Math.ceil((version * 4 + 4) / (num * 2 - 2)) * 2;
      alignPos = [6];
      for (var pos = size - 7; alignPos.length < num; pos -= step) alignPos.splice(1, 0, pos);
    }
    for (var a = 0; a < alignPos.length; a++) for (var c = 0; c < alignPos.length; c++) {
      if ((a === 0 && c === 0) || (a === 0 && c === alignPos.length - 1) || (a === alignPos.length - 1 && c === 0)) continue;
      for (var dy2 = -2; dy2 <= 2; dy2++) for (var dx2 = -2; dx2 <= 2; dx2++)
        setFn(alignPos[c] + dx2, alignPos[a] + dy2, Math.max(Math.abs(dx2), Math.abs(dy2)) !== 1);
    }
    // Reserve format/version areas
    drawFormatBits(0);
    if (version >= 7) {
      var rem = version;
      for (var vi = 0; vi < 12; vi++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
      var vbits = version << 12 | rem;
      for (var vk = 0; vk < 18; vk++) {
        var bit = ((vbits >>> vk) & 1) === 1;
        var aa = size - 11 + vk % 3, bb = Math.floor(vk / 3);
        setFn(aa, bb, bit); setFn(bb, aa, bit);
      }
    }
    function drawFormatBits(mask) {
      var d = ECC_FORMAT_BITS[ecl] << 3 | mask, r = d;
      for (var fi = 0; fi < 10; fi++) r = (r << 1) ^ ((r >>> 9) * 0x537);
      var bits2 = (d << 10 | r) ^ 0x5412;
      for (var fk = 0; fk <= 5; fk++) setFn(8, fk, ((bits2 >>> fk) & 1) === 1);
      setFn(8, 7, ((bits2 >>> 6) & 1) === 1);
      setFn(8, 8, ((bits2 >>> 7) & 1) === 1);
      setFn(7, 8, ((bits2 >>> 8) & 1) === 1);
      for (var fj = 9; fj < 15; fj++) setFn(14 - fj, 8, ((bits2 >>> fj) & 1) === 1);
      for (var fm = 0; fm < 8; fm++) setFn(size - 1 - fm, 8, ((bits2 >>> fm) & 1) === 1);
      for (var fn = 8; fn < 15; fn++) setFn(8, size - 15 + fn, ((bits2 >>> fn) & 1) === 1);
      setFn(8, size - 8, true);
    }

    // Place data
    var idx = 0;
    for (var right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (var vert = 0; vert < size; vert++) {
        for (var jj = 0; jj < 2; jj++) {
          var x = right - jj;
          var upward = ((right + 1) & 2) === 0;
          var y2 = upward ? size - 1 - vert : vert;
          if (!isFunction[y2][x] && idx < allCodewords.length * 8) {
            modules[y2][x] = ((allCodewords[idx >>> 3] >>> (7 - (idx & 7))) & 1) !== 0;
            idx++;
          }
        }
      }
    }

    // Masking — choose lowest penalty
    var bestMask = 0, minPenalty = Infinity, snapshot;
    var base = modules.map(function (r) { return r.slice(); });
    for (var m = 0; m < 8; m++) {
      var trial = base.map(function (r) { return r.slice(); });
      applyMask(trial, isFunction, m, size);
      var mm = { modules: trial, size: size };
      drawFormatOn(trial, isFunction, ecl, m, size);
      var p = penalty(trial, size);
      if (p < minPenalty) { minPenalty = p; bestMask = m; snapshot = trial; }
    }
    return { size: size, modules: snapshot, version: version };
  }

  function drawFormatOn(mod, isFn, ecl, mask, size) {
    var d = ECC_FORMAT_BITS[ecl] << 3 | mask, r = d;
    for (var i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
    var bits = (d << 10 | r) ^ 0x5412;
    function set(x, y, v) { if (x >= 0 && y >= 0 && x < size && y < size) mod[y][x] = v; }
    for (var k = 0; k <= 5; k++) set(8, k, ((bits >>> k) & 1) === 1);
    set(8, 7, ((bits >>> 6) & 1) === 1);
    set(8, 8, ((bits >>> 7) & 1) === 1);
    set(7, 8, ((bits >>> 8) & 1) === 1);
    for (var j = 9; j < 15; j++) set(14 - j, 8, ((bits >>> j) & 1) === 1);
    for (var m = 0; m < 8; m++) set(size - 1 - m, 8, ((bits >>> m) & 1) === 1);
    for (var n = 8; n < 15; n++) set(8, size - 15 + n, ((bits >>> n) & 1) === 1);
    set(8, size - 8, true);
  }

  function applyMask(mod, isFn, mask, size) {
    for (var y = 0; y < size; y++) for (var x = 0; x < size; x++) {
      if (isFn[y][x]) continue;
      var invert;
      switch (mask) {
        case 0: invert = (x + y) % 2 === 0; break;
        case 1: invert = y % 2 === 0; break;
        case 2: invert = x % 3 === 0; break;
        case 3: invert = (x + y) % 3 === 0; break;
        case 4: invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
        case 5: invert = x * y % 2 + x * y % 3 === 0; break;
        case 6: invert = (x * y % 2 + x * y % 3) % 2 === 0; break;
        case 7: invert = ((x + y) % 2 + x * y % 3) % 2 === 0; break;
      }
      if (invert) mod[y][x] = !mod[y][x];
    }
  }

  function penalty(mod, size) {
    var result = 0, x, y, i;
    // Rows & columns runs
    for (y = 0; y < size; y++) {
      var runColor = mod[y][0], runLen = 1;
      for (x = 1; x < size; x++) {
        if (mod[y][x] === runColor) { runLen++; if (runLen === 5) result += 3; else if (runLen > 5) result++; }
        else { runColor = mod[y][x]; runLen = 1; }
      }
    }
    for (x = 0; x < size; x++) {
      var rc = mod[0][x], rl = 1;
      for (y = 1; y < size; y++) {
        if (mod[y][x] === rc) { rl++; if (rl === 5) result += 3; else if (rl > 5) result++; }
        else { rc = mod[y][x]; rl = 1; }
      }
    }
    // 2x2 blocks
    for (y = 0; y < size - 1; y++) for (x = 0; x < size - 1; x++) {
      var c = mod[y][x];
      if (c === mod[y][x + 1] && c === mod[y + 1][x] && c === mod[y + 1][x + 1]) result += 3;
    }
    // Finder-like patterns
    var pat = [true, false, true, true, true, false, true];
    function matchAt(getter, len, start) {
      for (var k = 0; k < 7; k++) if (getter(start + k) !== pat[k]) return false;
      var before = true, after = true;
      for (var b = 1; b <= 4; b++) { if (start - b >= 0 && getter(start - b)) before = false; }
      for (var a = 0; a < 4; a++) { if (start + 7 + a < len && getter(start + 7 + a)) after = false; }
      return before || after;
    }
    for (y = 0; y < size; y++) for (x = 0; x <= size - 7; x++) {
      (function (yy, xx) { if (matchAt(function (k) { return mod[yy][k]; }, size, xx)) result += 40; })(y, x);
    }
    for (x = 0; x < size; x++) for (y = 0; y <= size - 7; y++) {
      (function (xx, yy) { if (matchAt(function (k) { return mod[k][xx]; }, size, yy)) result += 40; })(x, y);
    }
    // Balance
    var dark = 0;
    for (y = 0; y < size; y++) for (x = 0; x < size; x++) if (mod[y][x]) dark++;
    var total = size * size;
    var k5 = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
    result += k5 * 10;
    return result;
  }

  /* ---------- Renderers ---------- */
  function toSvgPath(qr, border) {
    border = border == null ? 2 : border;
    var parts = [];
    for (var y = 0; y < qr.size; y++) for (var x = 0; x < qr.size; x++) {
      if (qr.modules[y][x]) parts.push("M" + (x + border) + "," + (y + border) + "h1v1h-1z");
    }
    return { d: parts.join(""), dim: qr.size + border * 2 };
  }

  function toSvg(text, opts) {
    opts = opts || {};
    var qr = encode(text, opts.ecc || "M");
    var p = toSvgPath(qr, opts.border == null ? 2 : opts.border);
    var dark = opts.dark || "#06120D", light = opts.light || "#FFFFFF";
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + p.dim + ' ' + p.dim +
      '" shape-rendering="crispEdges" role="img" aria-label="' + (opts.label || "QR Code") + '">' +
      '<rect width="' + p.dim + '" height="' + p.dim + '" fill="' + light + '"/>' +
      '<path d="' + p.d + '" fill="' + dark + '"/></svg>';
  }

  global.NLQR = { encode: encode, toSvg: toSvg, toSvgPath: toSvgPath };
})(typeof window !== "undefined" ? window : globalThis);
