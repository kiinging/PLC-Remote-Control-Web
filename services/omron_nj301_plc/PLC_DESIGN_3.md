Below is a practical, “do-this-next” workflow to add an **NA5 HMI** into your **NJ301-1100 / Sysmac Studio** project so you can **control locally**, while keeping your current **Web/Gateway (Modbus) control** + your 3 PLC Tasks architecture.

---

## 0) The clean architecture (keep your current Tasks)

You already have this in PLC:

* **CommTask**: Modbus TCP server + unpack/pack `G_*`
* **PrimaryTask**: safety + takeover arbitration
* **ControlTask**: PID + MV generation

To add NA5 local control, do **NOT** let the NA write into `G_*` directly.

Instead:

* NA writes **HMI_*** commands (local operator commands)
* PLC selects **effective** commands:

  * if Web is active → use `G_*`
  * else → use `HMI_*`

This is exactly what your `WebActive THEN ... ELSE ...` structure is meant for.

---

## 1) Physical wiring & IP plan (simple and reliable)

### Recommended cabling

* **NA Ethernet Port 1** → same switch/network as **NJ Ethernet/IP port** (normal runtime comms)
* **NA Ethernet Port 2** (optional) → your laptop for easy download/debug

  * NA manuals explicitly support using **Ethernet port 2** for direct Sysmac Studio connection, and you can tick **“Direct Connection with Sysmac Studio”** in HMI TCP/IP settings. 

### IP example (runtime network)

* NJ: `192.168.0.134`
* NA (port 1): `192.168.0.20`
* Mask: `255.255.255.0`

*(Gateway Modbus on port 1502 can keep running—NA uses different comms stack, so it can coexist.)*

---

## 2) Add the NA5 into the SAME Sysmac Studio project

In Sysmac Studio (with your NJ project open):

1. **Insert → HMI → NA5**
2. Pick your exact NA5 model and confirm. ([Omron Store][1])
3. In **Multiview Explorer**, use the device dropdown to switch between **Controller** and **HMI** (very important for the next steps). ([Omron Store][1])

---

## 3) Create the PLC “local HMI command” globals (HMI_*)

In the NJ project → **Programming → Data → Global Variables**, add (example):

```iecst
VAR_GLOBAL
    // Local operator commands from NA
    HMI_PLC_Enable : BOOL;
    HMI_Mode       : INT;   // 0 manual, 1 auto, 2 tune
    HMI_Setpoint   : REAL;
    HMI_Manual_MV  : REAL;
    HMI_TuneCmd    : BOOL;

    // Helpful status to display on NA
    G_WebActive    : BOOL;  // optional: compute in PrimaryTask
END_VAR
```

**Key rule:** NA needs **global** variables (not local). If you created them inside a program, “move to global”. ([Omron Store][1])

---

## 4) HMI communications settings (NA side)

On the NA device in Multiview Explorer:

* **Configurations and Setup → HMI Settings**

  * Set **TCP/IP** for **Ethernet Port 1** (runtime IP)
  * If you want laptop direct download via NA Port 2:

    * enable **Direct Connection with Sysmac Studio** and connect Sysmac Studio to **Ethernet Port 2** 

---

## 5) Variable Mapping (this is the “magic” step)

On the NA device in Multiview Explorer:

1. Go to **Configurations and Setup → Variable Mapping**
2. Expand your **PLC device → User Variables**
3. For the variables you want on HMI:

   * right-click → **Create Device Variable** (or “with prefix”)
4. Now you’ll have NA-side tags linked to PLC globals. ([Omron Store][1])

**Good news:** When the NJ controller is **registered in the current project**, Sysmac Studio handles device registration automatically—your main work is comms + variable mapping. ([files.omron.eu][2])

> Note: If you are using a **non-default PLC Ethernet port**, Omron notes you may need to uncheck “use IP address configured on internal device” and explicitly set the target port IP. ([files.omron.eu][2])

---

## 6) Build NA pages (minimum set that matches your system)

### Page: “Overview”

Bind displays (read-only):

* `G_RTD_Temp`
* `G_Current_MV`
* `G_OverheatLatched`
* `G_CommAlive`
* `G_Web_Status` (and/or `G_WebActive`)

### Page: “Local Control”

Bind inputs:

* Toggle / button → `HMI_PLC_Enable`
* Mode selector (0/1/2) → `HMI_Mode`
* Numeric input → `HMI_Setpoint`
* Numeric input/slider → `HMI_Manual_MV`
* Momentary button → `HMI_TuneCmd` (set TRUE while pressed)

**Tip (strongly recommended):** Disable local controls when web owns control:

* For each control object, bind its **Enabled** property to `NOT G_WebActive`
* And show a big banner: “WEB CONTROL ACTIVE”

This prevents confusing “why isn’t my button working?” moments.

---

## 7) PLC arbitration (tie NA into your existing PrimaryTask logic)

In **PrimaryTask**, compute and expose a `G_WebActive` (so NA can show it), and keep your selection logic:

```iecst
// Web takeover decision
G_WebActive := (G_Web_Status <> 0) AND G_CommAlive;

// Select EFFECTIVE commands
IF G_WebActive THEN
    // use G_* from gateway
ELSE
    // use HMI_* from NA
END_IF;
```

That’s it—no changes needed to CommTask mapping, Modbus registers, etc.

---

## 8) Download/transfer (typical sequence)

1. Connect PC ↔ NJ (USB or Ethernet) and go Online
2. Connect PC ↔ NA (USB, or NA Ethernet port 2 “direct connection”) 
3. **Synchronize/Transfer**:

   * download controller project to NJ
   * download HMI project to NA
4. Put NJ in RUN, test NA buttons and watch `HMI_*` change in Watch window

---

## 9) Common pitfalls (quick checklist)

* ✅ Variables must be **Global** (not local) for NA mapping ([Omron Store][1])
* ✅ You must do **Variable Mapping** on the NA side (it won’t “just see” PLC tags automatically) ([Omron Store][1])
* ✅ Don’t let NA write `G_*` directly—use `HMI_*` then arbitrate in PrimaryTask
* ✅ Show/disable controls based on `G_WebActive` so operators understand ownership

---

If you tell me your **NA5 exact model** (e.g., NA5-7W001S-V1) and whether you want **Local to auto-takeover when comm fails** (your current logic already does), I can propose a clean NA screen tag list + page layout that matches your dashboard features 1:1.

[1]: https://store.omron.co.nz/knowledge-base/how-to-connect-an-na-hmi-to-an-nxnj-plc?srsltid=AfmBOor00TlzZh5aG6sq1xtq5r1EmUrfxOtqIboDlSd2ZLnqUvoJA6xF "How to connect an NA HMI to an NX/NJ PLC"
[2]: https://files.omron.eu/downloads/latest/manual/en/v119_na_series_programmable_terminal_device_connection_users_manual_en.pdf?v=2 "NA-series Programmable Terminal Device Connection User’s Manual"
