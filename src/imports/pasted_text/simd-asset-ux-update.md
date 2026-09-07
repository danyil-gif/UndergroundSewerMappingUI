# SIMD — Asset Data Collection UX Update

Update the existing **SIMD Infrastructure Workspace asset creation/editing experience** using the requirements below.

## UX Principle

Do not create a separate workflow or page for every asset type.

Use **one reusable Asset Details panel/modal** with:

1. Common information shown for every asset.
2. Asset-specific sections that dynamically appear based on the selected Asset Type.
3. Media upload areas where required.
4. Testing/inspection subsections where applicable.
5. Existing asset information editable later by clicking the asset directly on the infrastructure map.

Keep the experience fast, visual, and field-technician friendly.

---

# 1. Asset Types

Replace/update the Asset Type list with exactly these 13 options:

1. Catch Basin
2. Storm Basin
3. Sanitary Basin
4. Clean-out — Floor
5. Clean-out — Stack Into Floor
6. Clean-out — Through Foundation Wall
7. Clean-out — Overhead
8. Stack — No Clean-out
9. Floor Drain
10. Gutter Hub
11. Turf Drain
12. Ejector Pump
13. Sump Pump

Present these as easy-to-identify asset cards/icons rather than a long generic dropdown when space permits.

---

# 2. Common Fields — ALL Assets

Every asset must collect:

### Asset Type

Automatically populated from the selected asset.

### Location

Use a dropdown/chip selector:

* Basement
* Hallway
* Outside
* Courtyard
* Walkway
* Front Yard
* Unit
* Laundry Room
* Storage Room
* Bike Room
* Other

If **Other** is selected, reveal a free-text field:

**Describe Location**

---

# 3. Basins

Applies to:

* Catch Basin
* Storm Basin
* Sanitary Basin

### Photos

**Wider Area View**
Photo showing the basin and surrounding area.

**Close-Up**
Close-up photo of the basin/lid.

**Inside — Lid Open**
Photo looking inside the basin with the lid removed/open.

### Depth

Numeric field.

Example:

**Depth:** `[ 6 ] ft`

### Condition Rating

Use the **existing SIMD condition-rating system already built into the prototype**.

Show the available condition ratings as selectable cards/chips and display the existing description for each rating.

---

# 4. Clean-out — Floor

### Photos

**Wider Area View**

**Close-Up**

### Clean-out Access Size

Numeric input in inches.

Example:

**Access Size:** `[ 4 ] in`

### Access Configuration

* One-Way
* Two-Way

### Underground Connection

* Tee
* Wye
* Sanitary Tee
* 90°
* Unknown
* Other

If **Other** is selected, reveal a free-text field.

---

# 5. Clean-out — Stack Into Floor

### Photos

**Wider Area View**

**Close-Up**

### Clean-out Access Size

Numeric input in inches.

### Vertical Pipe Size

Numeric input in inches.

### Underground Connection

* Tee
* Wye
* Sanitary Tee
* 90°
* Unknown
* Other

If **Other** is selected, reveal a free-text field.

---

# 6. Clean-out — Through Foundation Wall

### Photos

**Wider Area View**

**Close-Up**

### Clean-out Access Size

Numeric input in inches.

---

# 7. Clean-out — Overhead

### Photos

**Wider Area View**

**Close-Up**

### Clean-out Access Size

Numeric input in inches.

### Above-Ground / Horizontal Pipe Size

Numeric input in inches.

### Vertical Pipe Size

Numeric input in inches.

Clearly differentiate the three measurements so they are not confused.

---

# 8. Stack — No Clean-out

### Photos

**Wider Area View**

**Close-Up**

### Stack Size

Numeric input in inches.

Keep this asset form intentionally simple.

---

# 9. Floor Drain

### Photos

**Wider Area View**

**Close-Up**

### Flow Test

Create a visually separate subsection:

**Flow Test Video**
Required video upload.

**Is There Flow?**

* YES
* NO

**Save Test**

The Flow Test information should remain associated with the asset.

After saving, clearly show the completed test and result.

Example:

**Flow Test — Completed ✓**

Video available

Result: **Yes — Flow Confirmed**

---

# 10. Turf Drain

### Photos

**Wider Area View**

**Close-Up**

### Flow Test

**Flow Test Video**
Required video upload.

**Is There Flow?**

* YES
* NO

**Save Test**

The saved Flow Test should remain associated with the Turf Drain.

---

# 11. Ejector Pump

### Photos

**Wider Area View**

**Close-Up**

### Installation Date

Date picker.

### Discharge Test

Create a visually separate subsection:

**Discharge Test Video**
Required video upload.

**Is the Pump Functioning Properly?**

* YES — Functioning Properly
* NO — Not Functioning Properly

**Save Test**

Once saved, display the completed test and its result.

---

# 12. Sump Pump

### Photos

**Wider Area View**

**Close-Up**

### Installation Date

Date picker.

### Discharge Test

**Discharge Test Video**
Required video upload.

**Is the Pump Functioning Properly?**

* YES — Functioning Properly
* NO — Not Functioning Properly

**Save Test**

Preserve the test with the asset.

---

# 13. Gutter Hub

### Photos

**Wider Area View**

**Close-Up**

### Accessible for Camera Inspection?

* YES
* NO

If **YES**, reveal:

**+ ADD SEWER CAMERA**

If **NO**, do not display the sewer-camera option.
