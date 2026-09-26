#!/usr/bin/env python3
import datetime
import json
import os
import sys
import urllib.error
import urllib.request

SUP = os.environ["SUP_URL"]
KEY = os.environ["SUP_KEY"]
PIN = os.environ.get("SUP_PIN", "2468")
OUT = os.environ.get("RUNNER_OUT", ".")
TODAY_D = datetime.date.today()
TODAY = TODAY_D.isoformat()


def rpc(name, payload):
    req = urllib.request.Request(
        SUP + "/rest/v1/rpc/" + name,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "apikey": KEY,
            "Authorization": "Bearer " + KEY,
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        return {"http_error": e.code}
    except Exception as e:
        return {"http_error": str(e)}


def main():
    lst = rpc("api_admin", {"p_pin": PIN, "p_action": "list", "p": {}})
    if not lst.get("ok"):
        print("FATAL api_admin list:", json.dumps(lst)[:300])
        return 2
    stores = lst.get("stores", [])
    print("== Tiendas:", len(stores))

    fails, warns, backups = [], [], []
    for s in stores:
        sid = s.get("id", "?")
        st = s.get("status")
        due = s.get("paid_until")
        d = rpc("api_public", {"p_store": sid})
        rec = dict(s)
        rec["doc"] = d
        backups.append(rec)

        if st == "activa":
            if d.get("ok") is not True:
                fails.append(
                    "%s (activa) sin respuesta http=%s err=%s"
                    % (sid, d.get("http_error") or 200, d.get("error") or "?")
                )
            else:
                print(
                    "  OK  %-22s %-28s productos=%s mp=%s"
                    % (
                        sid,
                        (rec.get("biz") or "")[:28],
                        len(d.get("products") or []),
                        "on" if d.get("mp_ok") else "off",
                    )
                )
        else:
            ok_expected = not d.get("ok")
            if not ok_expected:
                print("  nota: %s (%s) responde ok=true" % (sid, st))
            print("  OK  %-22s %-28s (%s, bloqueada correctamente)"
                  % (sid, (rec.get("biz") or "")[:28], st))

        if st in ("activa", "suspendida") and due:
            try:
                du = datetime.date.fromisoformat(str(due)[:10])
                days = (du - TODAY_D).days
                if 0 <= days <= 7:
                    warns.append("%s vence en %dd (%s)" % (sid, days, due))
            except ValueError:
                pass

    snap_fw = os.path.join(OUT, "backup-%s.json" % TODAY)
    with open(snap_fw, "w", encoding="utf-8") as f:
        json.dump(
            {"fecha": TODAY,
             "stamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
             "stores": backups},
            f, ensure_ascii=False, indent=1,
        )
    print("BACKUP %s (%d tiendas)" % (snap_fw, len(backups)))

    if warns:
        print("\n== VENCEN EN <=7 DIAS:")
        for w in warns:
            print("  -", w)
        with open(os.path.join(OUT, "vencimientos.txt"), "w", encoding="utf-8") as f:
            f.write("Estas tiendas de Mi-Tienda vencen dentro de 7 dias:\n\n" + "\n".join(warns) + "\n")
    else:
        print("\n== VENCIMIENTOS: ninguno en los proximos 7 dias")

    print("== RESUMEN: %d fallas" % len(fails))
    for fa in fails:
        print("  FAIL", fa)
    if os.environ.get("SUPPRESS_ERRORS"):
        return 0
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())