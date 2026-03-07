# Chrome Web Store Publishing Plan for LeetCode EasyRepeat

## Overview
This document provides a comprehensive, step-by-step plan to publish the LeetCode EasyRepeat Chrome extension to the Chrome Web Store.

---

## Phase 1: Pre-Submission Requirements

### 1.1 Google Developer Account Setup
- [ ] **Create a Google Developer Account** at [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
- [ ] **Pay the one-time registration fee**: $5 USD
- [ ] **Verify your email address** and complete account setup
- [ ] **Set up 2-factor authentication** (recommended for security)

### 1.2 Required Assets Preparation

#### Extension Icons (CRITICAL - Currently Missing!)
Your `src/icons/` directory is **empty**. You need to create icons in the following sizes:

| Size | Filename | Usage |
|------|----------|-------|
| 16x16 | `icon16.png` | Favicon, toolbar |
| 32x32 | `icon32.png` | Windows computers |
| 48x48 | `icon48.png` | Extensions management page |
| 128x128 | `icon128.png` | Chrome Web Store, installation |

**Design Recommendations:**
- Use a simple, recognizable design (e.g., a brain + code symbol for SRS)
- Ensure the icon is visible on both light and dark backgrounds
- Use PNG format with transparency
- Consider your Sakura/Matrix theme colors for brand consistency

#### Promotional Images for Store Listing
| Asset | Dimensions | Required |
|-------|------------|----------|
| Small Promo Tile | 440x280 px | Optional but recommended |
| Large Promo Tile | 920x680 px | Optional |
| Marquee Promo Tile | 1400x560 px | Optional |
| Screenshots | 1280x800 or 640x400 px | **Required (1-5)** |

**Screenshot Recommendations:**
1. Dashboard view showing problems due for review
2. Problem card with rating buttons (Easy/Medium/Hard)
3. Theme toggle demonstration (Sakura vs Matrix)
4. Toast notification on LeetCode page
5. Notes feature in action

---

## Phase 2: Manifest & Code Preparation

### 2.1 Update manifest.json

**Current Issues to Fix:**

```json
// Current (has issues):
{
    "name": "LeetCode LeetCode EasyRepeat",  // Duplicate "LeetCode"
    "default_title": "LeetCode LeetCode EasyRepeat"  // Duplicate "LeetCode"
}
```

**Required Changes:**

```json
{
    "manifest_version": 3,
    "name": "LeetCode EasyRepeat",
    "version": "1.0.1",
    "description": "Master LeetCode problems with spaced repetition. Automatically tracks submissions and schedules optimal review times using the SM-2 algorithm.",
    "icons": {
        "16": "src/icons/icon16.png",
        "32": "src/icons/icon32.png",
        "48": "src/icons/icon48.png",
        "128": "src/icons/icon128.png"
    },
    "permissions": [
        "storage"
    ],
    "host_permissions": [
        "https://leetcode.com/*"
    ],
    "action": {
        "default_popup": "src/popup/popup.html",
        "default_title": "LeetCode EasyRepeat",
        "default_icon": {
            "16": "src/icons/icon16.png",
            "32": "src/icons/icon32.png",
            "48": "src/icons/icon48.png"
        }
    },
    "content_scripts": [
        {
            "matches": [
                "https://leetcode.com/problems/*"
            ],
            "js": [
                "src/algorithms/srs_logic.js",
                "src/shared/config.js",
                "src/algorithms/fsrs_logic.js",
                "src/content/content_ui.js",
                "src/content/leetcode_dom.js",
                "src/shared/storage.js",
                "src/content/leetcode_api.js",
                "src/content/content.js"
            ],
            "css": [
                "src/content/content.css"
            ]
        }
    ]
}
```

### 2.2 Code Quality Checks

- [ ] **Remove console.log statements** (or wrap in debug mode)
- [ ] **Remove any test/debug code** from production files
- [ ] **Ensure no hardcoded test data** exists
- [ ] **Verify all file paths** are correct and relative
- [ ] **Test extension in incognito mode** (different storage behavior)

### 2.3 Run All Tests

```bash
npm test
```

Ensure all tests pass before submission.

---

## Phase 3: Privacy & Legal Compliance

### 3.1 Privacy Policy (✓ Already Exists)

Your `PRIVACY_POLICY.md` is well-written. However, you need to:

- [ ] **Host the privacy policy online** (required by Chrome Web Store)
  - Options: GitHub Pages, your own website, or a service like Notion
  - Example URL: `https://yourusername.github.io/leetcode-srs-extension/privacy`

- [ ] **Update contact information** in the privacy policy:
  ```markdown
  ## 6. Contact Us
  If you have any questions about this Privacy Policy, please contact us at:
  *   your-email@example.com
  *   https://github.com/yourusername/leetcode-srs-extension/issues
  ```

### 3.2 Terms of Service (Optional but Recommended)

Consider creating a simple Terms of Service document.

### 3.3 Permissions Justification

You'll need to justify each permission during submission:

| Permission | Justification |
|------------|---------------|
| `storage` | Required to save user's problem history, review schedules, notes, and theme preferences locally |
| `https://leetcode.com/*` | Required to detect accepted submissions and fetch problem details (title, difficulty, topics) |

---

## Phase 4: Store Listing Preparation

### 4.1 Extension Details

**Name:** LeetCode EasyRepeat (max 45 characters)

**Short Description (max 132 characters):**
```
Master LeetCode with spaced repetition. Auto-tracks submissions & schedules reviews using SM-2 algorithm. Cyberpunk UI included!
```

**Detailed Description (max 16,000 characters):**
```
🧠 MASTER LEETCODE WITH SCIENCE-BACKED SPACED REPETITION

LeetCode EasyRepeat automatically tracks your "Accepted" submissions and schedules optimal review times using the proven SM-2 spaced repetition algorithm—the same system used by Anki and other memory apps.

✨ KEY FEATURES

📊 Smart Spaced Repetition
• Automatic submission detection on LeetCode
• SM-2 algorithm calculates optimal review intervals
• Rate problems as Easy/Medium/Hard to personalize your schedule
• Track problem difficulty (Easy/Medium/Hard) automatically

🎨 Stunning Cyberpunk UI
• Sakura Theme: Neon peach, pink, and orange glows
• Matrix Theme: Classic green terminal aesthetic
• Dynamic theme switching with saved preferences
• Beautiful toast notifications that match your theme

📈 Visual Dashboard
• Cognitive retention heatmap showing practice patterns
• Mini projection timelines for future reviews
• Expandable problem cards with all details
• Direct links to problems

📝 Contextual Notes
• Floating notes button on LeetCode pages
• Draggable interface for custom positioning
• Auto-sync with Chrome Storage
• Never lose your insights again

⚙️ Advanced Features
• Manual scan for missed submissions
• Simulation mode for testing
• Data export/import (coming soon)
• Comprehensive error handling

🔒 PRIVACY FIRST
• All data stored locally on your device
• No external servers or databases
• No tracking or analytics
• Open source and transparent

🚀 HOW IT WORKS
1. Install the extension
2. Solve problems on LeetCode as usual
3. When you get "Accepted", the extension automatically saves it
4. Check the popup to see problems due for review
5. Rate problems to optimize your schedule

Perfect for:
• Interview preparation
• Competitive programming practice
• Long-term LeetCode mastery
• Anyone who wants to remember solutions

Built with ❤️ for the LeetCode community.
```

### 4.2 Category Selection

**Primary Category:** Productivity
**Additional Category:** Education (if available)

### 4.3 Language

**Primary Language:** English

---

## Phase 5: Package & Submit

### 5.1 Create Distribution Package

**Files to EXCLUDE from the ZIP:**
- `node_modules/`
- `tests/`
- `plans/`
- `.git/`
- `.gitignore`
- `package.json`
- `package-lock.json`
- `todo.md`
- `verify_streak.js`
- `README.md` (not needed in extension)
- `PRIVACY_POLICY.md` (host online instead)

**Create a clean build script:**

```bash
#!/bin/bash
# build.sh - Create distribution package

# Create dist directory
rm -rf dist
mkdir -p dist

# Copy required files
cp manifest.json dist/
cp -r src dist/

# Create ZIP
cd dist
zip -r ../leetcode-easyrepeat-v1.0.1.zip .
cd ..

echo "Package created: leetcode-easyrepeat-v1.0.1.zip"
```

### 5.2 Submission Checklist

Before uploading to Chrome Web Store:

- [ ] Icons created and added to manifest
- [ ] manifest.json name fixed (remove duplicate "LeetCode")
- [ ] All tests passing
- [ ] Privacy policy hosted online
- [ ] Screenshots prepared (1280x800 px)
- [ ] Store description written
- [ ] ZIP package created (excluding dev files)
- [ ] Extension tested in fresh Chrome profile

### 5.3 Submit to Chrome Web Store

1. Go to [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
2. Click "New Item"
3. Upload your ZIP file
4. Fill in store listing details:
   - Name, description, category
   - Upload screenshots and promotional images
   - Add privacy policy URL
   - Select target regions
5. Submit for review

---

## Phase 6: Post-Submission

### 6.1 Review Process

- **Timeline:** Typically 1-3 business days, but can take longer
- **Status:** Check dashboard for review status
- **Rejection:** If rejected, you'll receive specific feedback to address

### 6.2 Common Rejection Reasons & Solutions

| Reason | Solution |
|--------|----------|
| Missing icons | Add all required icon sizes |
| Vague description | Be specific about functionality |
| Privacy policy issues | Ensure policy is accessible and accurate |
| Excessive permissions | Justify each permission clearly |
| Trademark issues | Don't use "LeetCode" in a way that implies official affiliation |

### 6.3 After Approval

- [ ] **Announce the release** on social media, Reddit (r/leetcode), etc.
- [ ] **Set up user feedback channels** (GitHub Issues, email)
- [ ] **Monitor reviews** and respond to user feedback
- [ ] **Plan future updates** based on user requests

---

## Appendix A: Quick Action Items

### Immediate Tasks (Before Submission)

1. **Create extension icons** (16x16, 32x32, 48x48, 128x128)
2. **Fix manifest.json** (remove duplicate "LeetCode" in name)
3. **Host privacy policy** online
4. **Take screenshots** of the extension in action
5. **Create Google Developer account** and pay $5 fee

### Files to Create/Modify

| File | Action |
|------|--------|
| `src/icons/icon16.png` | Create |
| `src/icons/icon32.png` | Create |
| `src/icons/icon48.png` | Create |
| `src/icons/icon128.png` | Create |
| `manifest.json` | Update (fix name, add icons) |
| `PRIVACY_POLICY.md` | Update contact info |
| `build.sh` | Create (optional, for packaging) |

---

## Appendix B: Trademark Considerations

**Important:** "LeetCode" is a trademark. To avoid rejection:

1. Don't claim to be an official LeetCode product
2. Add a disclaimer: "This extension is not affiliated with or endorsed by LeetCode."
3. Consider alternative names if issues arise:
   - "EasyRepeat for LC"
   - "Code Review SRS"
   - "Algorithm Spaced Repetition"

---

## Appendix C: Version Update Checklist

For future updates:

1. Update version in `manifest.json`
2. Update version in `package.json`
3. Update changelog (consider creating `CHANGELOG.md`)
4. Run all tests
5. Create new ZIP package
6. Upload to Chrome Web Store
7. Submit for review

---

## Timeline Estimate

| Phase | Duration |
|-------|----------|
| Asset creation (icons, screenshots) | 1-2 days |
| Code fixes and testing | 1 day |
| Privacy policy hosting | 1 hour |
| Store listing preparation | 2-3 hours |
| Submission | 30 minutes |
| Review process | 1-7 days |

**Total estimated time to publish:** 3-10 days

---

*Last Updated: January 20, 2026*
