# 💻 MiniIDE - High-Performance Browser-Based IDE

**MiniIDE** is a fully functional, client-side Integrated Development Environment (IDE) built to provide a seamless coding experience directly in the web browser. It eliminates the need for a backend or Node.js environment by utilizing powerful browser APIs and client-side compilers.

## 🚀 Live Demo
You can explore the IDE here:  
👉 [https://arpitach64.github.io/CODE-IDE-Project/](https://arpitach64.github.io/CODE-IDE-Project/)

## ✨ Core Features

* **⚡ Professional Editor:** Powered by the **Monaco Editor** (the core of VS Code) for advanced syntax highlighting, IntelliSense, and multi-file model management.
* **📂 Advanced File System:** * Supports nested folder structures and file management.
    * Persistent storage using `localStorage` to save your project state across sessions.
    * Integrated folder upload capabilities and full project export as a **ZIP file**.
* **🐍 Browser-Runtime Python:** Uses the **Skulpt** library to execute Python code entirely on the client side.
* **🌐 Web Preview & Console:** * Real-time preview for HTML/CSS/JS projects.
    * Custom sandboxed console that captures and displays logs, errors, and script outputs via a secure message bridge.
* **📏 Fully Resizable Layout:** A modern, 3-pane interface (Sidebar, Editor, Bottom Panel) with custom-built draggable resizers for complete workspace control.
* **🌓 UI/UX Excellence:** Includes an adaptive Dark/Light theme, tabbed navigation, and keyboard shortcuts (e.g., `Ctrl+S` for saving).

## 🛠️ Tech Stack

* **Core:** HTML5, CSS3 (Custom Variables & Flexbox), Vanilla JavaScript (ES6+).
* **Editor Engine:** [Monaco Editor](https://microsoft.github.io/monaco-editor/)
* **Compilers/Libraries:** * [Skulpt](https://skulpt.org/) - Python in the browser.
    * [JSZip](https://stuk.github.io/jszip/) - For project bundling and downloads.

## 📂 Project Structure

* `index.html` – Application shell and UI layout.
* `style.css` – Professional IDE styling, theme management, and resizer logic.
* `app.js` – Core logic: Virtual file system, Monaco model management, and execution sandboxing.

---
Developed with ❤️ by [Arpitach64](https://github.com/Arpitach64)
