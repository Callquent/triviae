#!/usr/bin/env python3
"""Retire la signature Authenticode (devenue invalide après l'injection) d'un exécutable Windows."""
import struct, sys
p = sys.argv[1]
d = bytearray(open(p, "rb").read())
pe = struct.unpack_from("<I", d, 0x3C)[0]
assert d[pe:pe+4] == b"PE\0\0"
magic = struct.unpack_from("<H", d, pe + 24)[0]
assert magic == 0x20B, "PE32+ attendu"
dd = pe + 24 + 112 + 4 * 8          # entrée « Security » du répertoire de données
off, size = struct.unpack_from("<II", d, dd)
if off and size:
    struct.pack_into("<II", d, dd, 0, 0)
    if off + size >= len(d) - 8:      # certificat en fin de fichier : on le coupe
        del d[off:]
    print(f"signature retirée ({size} octets)")
else:
    print("pas de signature")
open(p, "wb").write(d)
