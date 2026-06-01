# sg-fire-simulator
FIRE (financial independence, retire early) simulator for Singapore residents


# future changes

=================================================
V2 ROADMAP & NEXT-LEVEL UPGRADES
=================================================
1. State Object Architecture: Decouple HTML inputs from the math engine by scooping all variables into a single, version-controlled JSON object.
2. Invisible Auto-Save: Implement HTML5 localStorage so the user's browser automatically remembers their last inputs across sessions.
3. Institutional Vault (Export/Import): Add buttons to download the JSON State Object as a backup file, and an upload button to restore it, protecting data against browser cache clears and code updates.
=================================================

<!-- 
### saving inputs / state

1. The Invisible Auto-Save (Browser localStorage)
This is the most seamless, modern approach. HTML5 localStorage allows the JavaScript to save your inputs directly into your specific web browser's local memory.

How it works: We add a small script that triggers every time you change an input. It saves that exact configuration locally. The next time you visit the URL on that specific device and browser, it instantly repopulates the fields.

Privacy: Because the data is stored in your browser (not on the web server), a public visitor in another country loading the website will just see the blank, default state.

The Catch: It only works on the device you used to save it. If you set it up on your laptop, your phone won't have the data. If you clear your browser cache, the data is wiped.

2. The Institutional Vault (Export / Import JSON)
Since you are modeling highly sensitive financial data, this is the most bulletproof security method and completely device-agnostic.

How it works: We add two small buttons: "Export Plan" and "Import Plan". Clicking Export downloads a tiny, encrypted (or simply formatted) .json or .txt file to your computer containing all your variables. When you return to the site, you click Import, upload that specific file, and the dashboard instantly populates.

Privacy: Your data exists nowhere on the internet. It exists strictly as a file on your hard drive.

The Catch: It requires slightly more friction (managing a downloaded file) rather than just opening a bookmark.

3. The Bookmark Method (URL Query Parameters)
This is how tools like Google Maps save your state without requiring an account.

How it works: We write a script that updates the webpage URL to include your variables as you type. For example: yourwebsite.com/fire?age=35&retire=50&usd=500000. You simply bookmark that massive URL. When you click the bookmark, the JavaScript reads the URL and populates the fields.

Privacy: A standard visitor going to the base URL (yourwebsite.com/fire) will see nothing.

The Catch: If you accidentally copy-paste that long URL and send it to a friend to show them the tool, you are sending them your exact financial profile. Given the sensitivity of the data, this carries a slight human-error risk.

My recommendation is to implement Browser localStorage combined with a "Save/Load" button, as it provides the most app-like experience without the heavy lift of database architecture.

When you are in a rapid iteration phase—constantly adding new inputs, renaming variables, or changing how the math engine works—the way you manage state becomes a critical engineering decision.

If you just blindly save 50 individual input values to localStorage, your tool will inevitably "break" the next time you load it after changing the code. The JavaScript will go looking for a variable you renamed yesterday, find nothing, and crash the math engine.

Given your need for ongoing iteration, the most robust path is actually a Hybrid Architecture built on a concept called the "State Object." Here is how the professionals handle this in single-file web apps.

The "State Object" Architecture
Right now, your code reads inputs directly from the HTML boxes one by one. To make the tool robust, we need to decouple the DOM (the visual HTML) from the Data.

Instead of saving individual fields, we write a script that scoops up every single input on the page and packages it into one clean, version-controlled JSON object. It looks like this behind the scenes:

JSON
{
  "version": "1.0",
  "last_saved": "2026-06-01",
  "inputs": {
    "currentAge": 35,
    "inflation": 3.0,
    "hasGlobal": true
  }
}
Once your data is packaged into a State Object, you unlock the ultimate flexibility: you can push that exact same object to localStorage AND to a downloadable file.

Why this is the ultimate path for your workflow:
1. Bulletproof Schema Versioning
Because the object contains a "version": "1.0" tag, we can write an intelligent "Loader" script.
If you update your tool to Version 2.0 next week and add three new inputs, the Loader will see that the saved localStorage data is from Version 1.0. Instead of crashing, it will safely load the old variables, apply your new default presets for the missing new variables, and update the save file to Version 2.0. This prevents your app from breaking during development.

2. The "Institutional Vault" (Export/Import JSON)
Relying only on localStorage during active development is dangerous. If you clear your browser history, or if a code bug accidentally wipes the localStorage key, your carefully crafted financial profile is gone.
By using a State Object, we can add a simple "Export Data" button. It downloads your profile as a tiny .json text file. If you completely break the HTML file during a coding session, you just hit "Import Data," upload your file, and you are right back where you started.

3. It makes adding new inputs effortless
When we build the "Scooper" and "Loader" functions, we can design them dynamically. This means when you add a new HTML input field in the future, you won't have to write new code to tell the app to save it. The Scooper will automatically detect the new input and add it to the State Object.

The Recommended Implementation
I suggest we implement both Auto-Save (LocalStorage) and Manual Export/Import (JSON File) using a unified State Object.

The UX: As you type, the app silently auto-saves to your browser. You can close the tab and return tomorrow without missing a beat.

The Backup: When you are about to make major changes to the code, or if you want to test the tool on your phone, you click "Export Data" to generate a hard backup file.
-->

