// Elements

const terminal     = document.getElementById("terminal");
const fileInput    = document.getElementById("file-input");
const output       = document.getElementById("output");
const lightModeBtn = document.getElementById("light-mode");
const darkModeBtn  = document.getElementById("dark-mode");
const cancelBtn    = document.getElementById("cancel");

// Format Definitions

const imageFormats = ["jpeg", "jpg", "png", "webp", "svg", "bmp", "tiff", "gif"];
const videoFormats = ["mp4", "mkv", "mov", "avi", "flv", "wmv", "webm", "h265", "h264", "gif"];
const audioFormats = ["mp3", "wav", "flac", "aac", "ogg", "opus", "wma"];

let fileSelected = false;

//  Welcome Message Control

const urlParams   = new URLSearchParams(window.location.search);
const skipWelcome = urlParams.get("skipWelcome") === "true";

// Initial Terminal Prompts

function appendWelcomeBlock() {
  const welcomeLines = [
    `     `,
    `Welcome to the Terminal Converter — A stylish tool to convert images 🎨, audio 🎵, and video 🎬 files effortlessly.`,
    ``,
    `Features:`,
    ` • Click or drag-and-drop a file to get started`,
    ` • Pick a new format from available options`,
    ` • Terminal-style feedback as your file is converted`,
    ``,
    `Toolbar Options:`,
    ` <span class="dot yellow"></span> Light Mode`,
    ` <span class="dot blue"></span> Dark Mode`,
    ` <span class="dot red"></span> Cancel & reload session`,
    ``,
    `Initializing system...`
  ];

  appendPromptBlock(welcomeLines);
}

function appendInitialPrompt() {
  const line = document.createElement("p");
  line.className = "typed-initial-line";

  const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
  const promptText = isMobile
    ? "Tap here to select a file..."
    : "Click or drag your file here to begin...";

  line.innerHTML = `<span class="prefix">user@Terminal Converter ~></span> ${promptText}`;
  output.appendChild(line);
  appendSpacer();
}

// Prompt Rendering

function appendPromptBlock(lines) {
  const existingCursor = document.querySelector('.cursor');
  if (existingCursor) existingCursor.remove();

  const container = document.createElement("div");
  container.className = "prompt-block";

  const prefix = document.createElement("span");
  prefix.className = "prefix";
  prefix.textContent = "user@Terminal Converter ~>";
  container.appendChild(prefix);

  lines.forEach((html, index) => {
    const l = document.createElement("div");
    l.className = "typed-line";
    l.style.animationDelay = `${index * 0.6}s`;
    l.innerHTML = html;

    if (index === lines.length - 1) {
      const cursor = document.createElement("span");
      cursor.className = "cursor";
      l.appendChild(cursor);
    }

    container.appendChild(l);
  });

  output.appendChild(container);
  appendSpacer();
  autoScrollToBottom();
}

function appendSpacer() {
  const spacer = document.createElement("div");
  spacer.className = "prompt-spacer";
  output.appendChild(spacer);
}

function autoScrollToBottom() {
  output.scrollTop = output.scrollHeight;
}

// File Type & Format Helpers

function getFileType(ext) {
  if (imageFormats.includes(ext)) return "Image";
  if (videoFormats.includes(ext)) return "Video";
  if (audioFormats.includes(ext)) return "Audio";
  return "Unknown";
}

function showFormatOptions(formats, originalExt) {
  const existing = document.querySelector(".file-options.formats");
  if (existing) existing.remove();

  const container = document.createElement("div");
  container.className = "file-options formats";

  formats.forEach(format => {
    const option = document.createElement("span");
    const dot = document.createElement("div");
    const safeClass = isNaN(parseInt(format[0])) ? format : `f_${format}`;

    dot.className = `dot ${safeClass}`;

    const label = document.createElement("span");
    label.textContent = format;

    option.appendChild(dot);
    option.appendChild(label);
    option.onclick = () => startConversion(originalExt, format);

    container.appendChild(option);
  });

  output.appendChild(container);
}

// File Handling & Validation

function handleFile(file) {
  const name = file.name;
  const ext = name.split(".").pop().toLowerCase();

  const allSupported = [...imageFormats, ...videoFormats, ...audioFormats];
  const disallowedUploadExtensions = ["264", "265", "h264", "h265", "hevc"];
  const isValidExt = allSupported.includes(ext) && !disallowedUploadExtensions.includes(ext);

  if (!isValidExt) {
    appendPromptBlock([
      `❌ Unsupported file type: <span class="highlight-ext">'.${ext}'</span>`,
      `Please upload a supported <span class="highlight-type">image</span>, <span class="highlight-type">audio</span>, or <span class="highlight-type">video</span> file.`
    ]);
    return;
  }

  fileSelected = true;
  window.currentFile = file;
  disableUploadActions();

  const initialPrompt = document.querySelector('.typed-line');
  if (initialPrompt) initialPrompt.style.display = 'none';
  const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
  const type = getFileType(ext);
  const lines = [
    `A file has been selected: <span class="highlight-file">'${name}'</span>`,
    `File type found to be: <span class="highlight-type">${type}</span>`,
    `File extension is: <span class="highlight-ext">'.${ext}'</span>`,
    `File size is: <span class="highlight-size">${sizeMB}MB</span>`,
    `Searching for available options... [Pick one]`
  ];

  appendPromptBlock(lines);

  let available = [];

  if (type === "Image") {
    if (ext === "gif") {
      available = ["mp4", "mkv", "mov", "avi", "flv", "wmv", "webm",...imageFormats.filter(f => f !== "gif")];
      setTimeout(() => {
        showFormatOptions(available, ext);
        setTimeout(() => autoScrollToBottom(), 100);
      }, (0.6 * lines.length + 0.3) * 1000);
    } 
    else if (ext === "svg") {
      available = ["png", "pdf", "ps", ...imageFormats.filter(f => f !== "svg")];
      setTimeout(() => {
        showFormatOptions(available, ext);
        setTimeout(() => autoScrollToBottom(), 100);
      }, (0.6 * lines.length + 0.3) * 1000);
    } 
    else {
      available = imageFormats.filter(f => f !== ext && f !== "svg");
      setTimeout(() => {
        showFormatOptions(available, ext);
        setTimeout(() => autoScrollToBottom(), 100);
      }, (0.6 * lines.length + 0.3) * 1000);
    }
  } 
  else if (type === "Video") {
    const totalDelay = 0.6 * lines.length + 0.3;

    setTimeout(() => {
      const toggleContainer = document.createElement("div");
      toggleContainer.className = "file-options toggle-container";

      const createToggle = (label, callback) => {
        const option = document.createElement("span");
        option.classList.add("toggle-option");

        const dot = document.createElement("div");
        dot.className = `dot ${label.toLowerCase()}`;

        const text = document.createElement("span");
        text.textContent = label;

        option.appendChild(dot);
        option.appendChild(text);
        option.onclick = () => {
          [...toggleContainer.children].forEach(c => c.classList.remove("active-toggle"));
          option.classList.add("active-toggle");
        
          const existing = document.querySelector(".file-options.formats");
          if (existing) existing.remove();
        
          callback();
          setTimeout(() => autoScrollToBottom(), 100);
        };        

        return option;
      };

      toggleContainer.appendChild(createToggle("Video", () => {
        showFormatOptions(videoFormats.filter(f => f !== ext), ext);
      }));

      toggleContainer.appendChild(createToggle("Audio", () => {
        showFormatOptions(audioFormats, ext);
      }));

      output.appendChild(toggleContainer);
      autoScrollToBottom();
    }, totalDelay * 1000);
  } 
  else if (type === "Audio") {
    available = audioFormats.filter(f => f !== ext);
    setTimeout(() => {
      showFormatOptions(available, ext);
      setTimeout(() => autoScrollToBottom(), 100);
    }, (0.6 * lines.length + 0.3) * 1000);
  }
}

// Conversion & Progress Logic

function startConversion(originalExt, targetFormat) {
  const clarificationLines = [`${originalExt} -> ${targetFormat} — Converting...`];

  if (["264", "h264", "265", "h265", "hevc"].includes(targetFormat.toLowerCase())) {
    clarificationLines.push(`Note: Output will be saved as .mp4 using ${targetFormat.includes("5") ? "libx265" : "libx264"} codec.`);
  }

  appendPromptBlock(clarificationLines);

  const progressBar = document.createElement("div");
  progressBar.className = "progress-bar";
  progressBar.textContent = "Progress: [                    ]";
  output.appendChild(progressBar);

  let progress = 0;
  const interval = setInterval(() => {
    if (progress < 20) {
      progress++;
      const bar = "=".repeat(progress) + " ".repeat(20 - progress);
      progressBar.textContent = `Progress: [${bar}]`;
      autoScrollToBottom();
    }
  }, 100);

  const formData = new FormData();
  formData.append("file", window.currentFile);
  formData.append("target", targetFormat);

  fetch("/convert", {
    method: "POST",
    body: formData,
  })
    .then(res => res.json())
    .then(data => {
      clearInterval(interval);

      if (data.download_url) {
        appendDownloadButton(data.download_url, targetFormat);
      } else {
        appendPromptBlock([`❌ Conversion failed: ${data.error || "Unknown error"}`]);
      }
    })
    .catch(err => {
      clearInterval(interval);
      appendPromptBlock([`❌ Conversion error: ${err.message}`]);
    });
}

function appendDownloadButton(downloadUrl, extension) {
  const container = document.createElement("div");
  container.className = "prompt-block";

  const prefix = document.createElement("span");
  prefix.className = "prefix";
  prefix.textContent = "user@Terminal Converter ~>";
  container.appendChild(prefix);

  const buttonWrapper = document.createElement("div");
  buttonWrapper.className = "download-wrapper";

  const button = document.createElement("a");
  button.href = downloadUrl;
  button.download = "";
  button.textContent = `Download .${extension}`;
  button.className = "download-btn-terminal";

  buttonWrapper.appendChild(button);
  container.appendChild(buttonWrapper);
  output.appendChild(container);
  appendSpacer();
  autoScrollToBottom();
}

// Upload & Input Handling

function handleClickUpload(e) {
  if (fileSelected || e.target.closest(".header")) return;
  fileInput.click();
}

function handleDropUpload(e) {
  if (fileSelected) return;
  const file = e.dataTransfer.files[0];
  if (file) handleFile(file);
}

function enableUploadActions() {
  terminal.addEventListener("click", handleClickUpload);
  terminal.addEventListener("drop", handleDropUpload);
}

function disableUploadActions() {
  terminal.removeEventListener("click", handleClickUpload);
  terminal.removeEventListener("drop", handleDropUpload);
}

["dragenter", "dragover", "dragleave", "drop"].forEach(eventName =>
  terminal.addEventListener(eventName, e => {
    e.preventDefault();
    e.stopPropagation();
  })
);

fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  if (file) handleFile(file);
});

// Cleanup & Toolbar Events

function cleanupTempFile() {
  if (!window.currentFile) return;

  const cleanupData = new FormData();
  cleanupData.append("filename", window.currentFile.name);

  navigator.sendBeacon("/cleanup", cleanupData);
}

lightModeBtn.addEventListener("click", () => document.body.classList.add("light-mode"));
darkModeBtn.addEventListener("click", () => document.body.classList.remove("light-mode"));

cancelBtn.addEventListener("click", () => {
  cleanupTempFile();
  location.href = location.pathname + "?skipWelcome=true";
});

window.addEventListener("beforeunload", () => {
  cleanupTempFile();
});

// Init

if (!skipWelcome) {
  setTimeout(() => {
    appendWelcomeBlock();
    setTimeout(() => {
      appendInitialPrompt();
      enableUploadActions();
    }, 10000);
  }, 2000);
} else {
  setTimeout(() => {
    appendInitialPrompt();
    enableUploadActions();
  }, 2000);

  window.history.replaceState(null, "", window.location.pathname);
}
