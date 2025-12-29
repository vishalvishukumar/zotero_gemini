## zotero_gemini
### add-on for zotero to summarize PDFs


Step 1: Get your free API_KEY from https://aistudio.google.com/api-keys. 

Step 2: Download bootstrap.js and manifest.json from https://github.com/vishalvishukumar/zotero_gemini

Step 3: Open bootstrap.js and go to line 13, and replace "YOUR_API_KEY_HERE" with your API_KEY that you created in https://aistudio.google.com/api-keys. If interested you could edit the prompt as well, it starts from line 303.

Step 4: Compress your updated bootstrap.js and manifest.json together to create a .zip file.

Step 5: Go to Zotero v7 -> Tools -> Plugins -> Gear Icon -> Install Plugin from file... -> locate your .zip you created. Install it.

Step 6: Now you could see "Generate Summary with Gemini" when you right click on parent item - simply click on "Generate Summary with Gemini". It will work if the PDF is inside a parent, so if PDF is not inside a parent, create a parent using "Create Parent Item..." or add a PDF first. 
