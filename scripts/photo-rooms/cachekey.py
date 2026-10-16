"""Keys that tie a cached result to the photo (and the settings) it was made from (development tool).

A cache named after the photo's file name alone serves the old result when a photo is replaced by another picture under the
same name. Every cache here stores this fingerprint and is redone when it no longer matches.
"""
import hashlib
from pathlib import Path


def fingerprint(path, *settings):
    """Short hash of a photo's bytes and of the settings that shape the result."""
    h = hashlib.sha1()
    h.update(Path(path).read_bytes())
    for s in settings:
        h.update(b'|' + str(s).encode('utf-8'))
    return h.hexdigest()[:16]
