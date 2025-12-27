// This single file now contains all the plugin's logic.

// We define the main object that will hold all our functions and data.
const ZoteroGeminiSummarizer = {
  // A flag to check if the plugin has been initialized.
  _initialized: false,
   
  // A flag to handle the cancellation of the summary process.
  _isCancelled: false,

  // Hardcoded API key for testing purposes.
  // Replace "YOUR_API_KEY_HERE" with your actual Google AI Studio API key.
  _apiKey: "YOUR_API_KEY_HERE", // get it from https://aistudio.google.com/api-keys

  // Use a WeakMap to track UI elements on a per-window basis.
  _addedElementIDs: new WeakMap(),

  // A helper function for logging messages to the Zotero debug console.
  _log(msg) {
    Zotero.debug(`Zotero Gemini Summarizer: ${msg}`);
  },

  // This function initializes the plugin.
  init({ id, version, rootURI }) {
    if (this._initialized) return;
    this._initialized = true;
    
    // Add the UI elements to all open Zotero windows.
    this.addToAllWindows();
    this._log("Plugin initialized and UI elements added.");
  },

  // Injects the plugin's UI elements into a Zotero window.
  addToWindow(window) {
    this._addedElementIDs.set(window, []); // Initialize element tracking for this window
    this._createItemMenu(window);
  },

  // Injects UI elements into all open Zotero windows.
  addToAllWindows() {
    for (const window of Zotero.getMainWindows()) {
      if (!window.ZoteroPane) continue;
      this.addToWindow(window);
    }
  },

  // Removes the plugin's UI elements from a window.
  removeFromWindow(window) {
    const elementIDs = this._addedElementIDs.get(window);
    if (!elementIDs) return;

    for (const id of elementIDs) {
      try {
        window.document.getElementById(id)?.remove();
      } catch (e) {
        this._log(`Could not remove element with id ${id}. It may have already been removed.`);
      }
    }
    this._addedElementIDs.delete(window); // Clean up tracking for this window
  },

  // Removes UI elements from all Zotero windows.
  removeFromAllWindows() {
    for (const window of Zotero.getMainWindows()) {
      if (!window.ZoteroPane) continue;
      this.removeFromWindow(window);
    }
  },

  // A utility to create and inject a XUL element into the UI.
  _injectXULElement(window, elementType, elementID, elementAttributes, parentID, eventListeners) {
    const document = window.document;
    const element = document.createXULElement(elementType);
    element.id = elementID;
    Object.entries(elementAttributes || {}).forEach(([key, value]) => element.setAttribute(key, value));
    Object.entries(eventListeners || {}).forEach(([eventType, listener]) => element.addEventListener(eventType, listener));
    document.getElementById(parentID).appendChild(element);
    this._addedElementIDs.get(window)?.push(element.id);
    return element;
  },

  // Creates the right-click context menu for Zotero items.
  _createItemMenu(window) {
    const document = window.document;
    const menuItem = this._injectXULElement(
      window,
      "menuitem",
      "zps-menu-item-" + window.Zotero_Tabs._selectedID,
      {
        label: "Generate Summary with Gemini",
        class: "menu-iconic",
      },
      "zotero-itemmenu",
      {
        command: () => this.generateSummaryForSelectedItems(),
      }
    );

    const menuPopup = document.getElementById("zotero-itemmenu");
    menuPopup.addEventListener("popupshowing", () => {
      menuItem.hidden = true;
      const items = Zotero.getActiveZoteroPane().getSelectedItems();
      
      const shouldShow = items.some(item => {
        if (item.isAttachment() && item.attachmentContentType === 'application/pdf' && item.attachmentPath) return true;
        if (item.isRegularItem()) {
            const attachments = Zotero.Items.get(item.getAttachments(false));
            return attachments.some(att => att.attachmentContentType === 'application/pdf' && att.attachmentPath);
        }
        return false;
      });

      if (shouldShow) {
        menuItem.hidden = false;
      }
    });
  },
  _markdownToHTML(md) {
    if (!md) return "";

    // Escape HTML special chars
    md = md.replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));

    // Extract code blocks and replace with placeholders
    const codeBlocks = [];
    md = md.replace(/```([\s\S]*?)```/g, (m, code) => {
      codeBlocks.push(`<pre><code>${code.replace(/</g,"&lt;").replace(/>/g,"&gt;")}</code></pre>`);
      return `\u0000CODEBLOCK${codeBlocks.length-1}\u0000`;
    });

    // Inline code
    md = md.replace(/`([^`]+?)`/g, '<code>$1</code>');

    // Headers
    md = md.replace(/^### (.*)$/gim, '<h3>$1</h3>');
    md = md.replace(/^## (.*)$/gim, '<h2>$1</h2>');
    md = md.replace(/^# (.*)$/gim, '<h1>$1</h1>');

    // Blockquotes
    md = md.replace(/^> (.*)$/gim, '<blockquote>$1</blockquote>');

    // Bold+Italic (***text***)
    md = md.replace(/\*\*\*(.*?)\*\*\*/g, '<b><i>$1</i></b>');

    // Bold (**text** or __text__)
    md = md.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
    md = md.replace(/__(.*?)__/g, '<b>$1</b>');

    // Italic (*text* or _text_)
    md = md.replace(/\*(.*?)\*/g, '<i>$1</i>');
    md = md.replace(/_(.*?)_/g, '<i>$1</i>');

    // Links [text](url)
    md = md.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "<a href='$2'>$1</a>");

    // Unordered lists
    md = md.replace(/^\s*[-*+]\s+(.*)$/gim, '<ul><li>$1</li></ul>');
    md = md.replace(/(<\/ul>\s*<ul>)+/g, '');

    // Ordered lists
    md = md.replace(/^\s*\d+\.\s+(.*)$/gim, '<ol><li>$1</li></ol>');
    md = md.replace(/(<\/ol>\s*<ol>)+/g, '');

    // Paragraphs (skip lines that are already HTML blocks)
    md = md.replace(/^(?!<h\d>|<ul>|<ol>|<li>|<blockquote>|<pre>|<p>|<code>)([^\n]+)$/gim, '<p>$1</p>');

    // Restore code blocks
    md = md.replace(/\u0000CODEBLOCK(\d+)\u0000/g, (m, i) => codeBlocks[i]);

    // Remove remaining line breaks
    md = md.replace(/\n/g, '');

    return md.trim();
  },

  // Main function to start the summarization process for selected Zotero items.
  async generateSummaryForSelectedItems() {
    this._isCancelled = false;
    this._log('Starting summary generation...');
    const progress = new Zotero.ProgressWindow();
    progress.onCancel = () => {
        this._log('Cancel button clicked by user.');
        this._isCancelled = true;
    };
    progress.changeHeadline("Zotero PDF Summarizer");
    progress.addDescription("Starting process...");
    progress.show();

    try {
      if (this._apiKey === "YOUR_API_KEY_HERE") {
          throw new Error("Please replace 'YOUR_API_KEY_HERE' in bootstrap.js with your actual API key.");
      }

      const items = Zotero.getActiveZoteroPane().getSelectedItems();
      if (!items.length) {
        this._log('No items selected.');
        progress.addDescription("No items selected.");
        progress.startCloseTimer(3000);
        return;
      }
      if (this._isCancelled) throw new Error("Cancelled by user.");

      for (const item of items) {
          if (this._isCancelled) break;
          
          let pdfAttachment, parentItem;
          if (item.isAttachment()) {
              pdfAttachment = item;
              parentItem = Zotero.Items.get(item.parentID);
          } else if (item.isRegularItem()) {
              parentItem = item;
              const attachments = Zotero.Items.get(item.getAttachments());
              pdfAttachment = attachments.find(att => att.attachmentContentType === 'application/pdf' && att.attachmentPath);
          }

          if (!parentItem) {
              this._log(`Could not find a parent for item ${item.id}. Skipping.`);
              continue;
          }
          const title = parentItem.getField('title');
          const itemProgress = new progress.ItemProgress('chrome://zotero/skin/toolbar-search.png', `Processing: ${title}`);

          if (!pdfAttachment) {
            itemProgress.setText("No PDF attachment found.");
            itemProgress.setError();
            continue;
          }

          itemProgress.setText(`Reading PDF...`);
          const pdfText = await this._getPDFText(pdfAttachment);
          if (this._isCancelled) break;

          if (!pdfText) {
            itemProgress.setText("PDF text extraction failed. See Error Console for details.");
            itemProgress.setError();
            continue;
          }

          itemProgress.setText(`Sending to Gemini...`);
          const summary = await this._callGeminiAPI(pdfText);
          // Zotero.getMainWindow().prompt() to get input from user
          if (this._isCancelled) break;
          
          itemProgress.setText("Summary received.");
          itemProgress.setProgress(100);
          
          // Create a child note with the summary under the parent item
          const note = new Zotero.Item("note");
          note.parentID = parentItem.id;
          note.libraryID = parentItem.libraryID;
          const htmlSummary = `<div style="font-size: 1.3em;">${this._markdownToHTML(summary)}</div>`;
          note.setNote(`<h1>Gemini Summary</h1>${htmlSummary}`);
          await note.saveTx();
          this._log(`Summary note created for item ${parentItem.id}.`);
      }
    } catch (error) {
        if (!this._isCancelled) {
            this._log(`An error occurred during summary generation: ${error.message}`);
            Zotero.logError(error);
            progress.addDescription(`An error occurred: ${error.message}`);
        }
    } finally {
        this._log('Summary generation process finished.');
        progress.changeHeadline(this._isCancelled ? "Cancelled" : "Finished");
        progress.startCloseTimer(2000);
    }
  },

  // Uses the user-recommended `attachment.attachmentText` property for robust text extraction.
  _getPDFText: async function (pdfAttachment) {
    this._log(`Searching for PDF text for attachment ID: ${pdfAttachment.id} using attachmentText property.`);
    try {
      const attachmentTextResult = await pdfAttachment.attachmentText;
      let text = null;

      // Handle the case where attachmentText returns an array
      if (Array.isArray(attachmentTextResult) && attachmentTextResult.length > 0) {
          text = attachmentTextResult.join("\n\n"); // Join all pages
      } else if (typeof attachmentTextResult === 'string') {
          text = attachmentTextResult;
      }
      
      if (!text || text.trim() === '') {
        this._log('Extracted text is empty. PDF may be image-based or has not been processed by Zotero OCR yet.');
        return null;
      }
      
      this._log(`Extracted ${text.length} characters of text.`);
      return text;
    } catch (e) {
      this._log(`Error extracting text from PDF: ${e.message}`);
      Zotero.logError(e);
      return null;
    }
  },
  
  async _callGeminiAPI(text) {
    const apiKey = this._apiKey;
    if (this._isCancelled) throw new Error("Cancelled by user.");

    const prompt = `
    
Objective: Conduct a comprehensive and critical review of the attached research papers with the following goals:

1. Key Contributions and Core Insights

- Extract and summarize the primary objectives, key findings, and novel contributions of the papers.
- Critically analyze the stated contribution by comparing it against the most relevant and recent research works, to sharpen the paper's unique positioning.

2. Keywords and Techniques Explained Simply

- Identify all keywords, algorithms, and domain-specific terminologies used in the paper. 
- For each, provide a simple and intuitive explanation ideal for early researchers or non-specialists.
- Also include relevant background knowledge to contextualize the techniques.

3. Recent and Highly Relevant Research.

Use Retrieval-Augmented Generation to search for recent, thematically aligned research papers (published in the last 5 years) that:

- Are published in high-impact, peer-reviewed journals (e.g., IEEE, ACM, Elsevier, Springer) and have high citation counts or editorial prominence.
- Paper-wise comparisons (do not use tables) on how attached papers differ from or align with the recent relevant papers on 
    a) problem formulation. 
    b) Methods used.
    c) claimed novelty.

4. Critical Methodology Evaluation

- Evaluate whether the chosen methodologies are the most appropriate for the research objectives.
- Critically assess their justification in the paper—are the reasons valid and well-supported?
- Suggest and analyze alternative techniques or models (e.g., newer ML algorithms, transformer variants, ensemble methods, etc.) that could potentially improve performance, reduce complexity, and increase generalizability.

  Provide citations and examples where such alternatives have been successfully applied in similar contexts.

5. Limitations and Future Scope

- Elaborate on the 'Limitations and Future Scope' (and identify any unstated limitations).
- Recommend concrete next steps that could directly address the identified limitations.
- Critically assess the future scope.

  Example: “ Limitation #n: <...> , Future Scope: <...>.”

Deliverables:

 Structured report or summary in sections corresponding to each task above.

 Re-evaluate the response to ensure it is comprehensive, coherent, and suitable for a research audience.


    :\n\n${text.substring(0, 150000)}`;
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`;
    
    // Moved safetySettings to the top level of the payload, outside of generationConfig.
    const payload = { 
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        safetySettings: [
            { "category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_NONE" },
            { "category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_NONE" },
            { "category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_NONE" },
            { "category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_NONE" }
        ]
    };

    this._log(`Sending ${payload.contents[0].parts[0].text.length} characters to Gemini.`);
    const response = await Zotero.HTTP.request("POST", apiUrl, {
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json" },
      timeout: 60000 // 1 minutes (adjust as needed)
    });
    this._log(`Received response from Gemini API with status: ${response.status}`);

    if (this._isCancelled) throw new Error("Cancelled by user.");
    
    let result;
    try {
        // **FIXED**: The response from Zotero.HTTP.request is an XMLHttpRequest object.
        // The raw text is in the `.responseText` property.
        result = JSON.parse(response.responseText);
    } catch (e) {
        Zotero.logError(e); // Log the technical parsing error itself
        // Throw a new, more informative error that includes the raw server response.
        throw new Error(`Failed to parse JSON response. Raw response text: ${response.responseText}`);
    }

    if (result.candidates && result.candidates.length > 0 && result.candidates[0].content) {
      return result.candidates[0].content.parts[0].text;
    } else {
      const finishReason = result.candidates?.[0]?.finishReason;
      const safetyRatings = result.promptFeedback?.safetyRatings || result.candidates?.[0]?.safetyRatings;
      let errorMessage = "Failed to get a summary from the API.";
      if (finishReason === "SAFETY") {
          errorMessage = `The response was blocked for safety reasons: ${JSON.stringify(safetyRatings)}`;
      } else if (result.error) {
          errorMessage = `API Error: ${result.error.message}`;
      }
      this._log(`API Error: ${errorMessage}. Full response: ${JSON.stringify(result)}`);
      throw new Error(errorMessage);
    }
  },
};

// Zotero calls these functions during its lifecycle.
function startup({ id, version, rootURI }) {
  ZoteroGeminiSummarizer.init({ id, version, rootURI });
}

function onMainWindowLoad({ window }) {
  ZoteroGeminiSummarizer.addToWindow(window);
}

function onMainWindowUnload({ window }) {
  ZoteroGeminiSummarizer.removeFromWindow(window);
}

function shutdown() {
  ZoteroGeminiSummarizer.removeFromAllWindows();
}
