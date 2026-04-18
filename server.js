const cds = require('@sap/cds');
const express = require('express');
const { google } = require('@ai-sdk/google');
const { generateText } = require('ai');
const { z } = require('zod');

cds.on('bootstrap', (app) => {
  console.log('[BOOT] bootstrap fired ✅');

  const router = express.Router();
  router.use(express.json());

  // ─────────────────────────────────────────────────────────────
  // Helper Function: Beautify Raw Tool Output
  // ─────────────────────────────────────────────────────────────
  async function beautifyResponse(gemini, rawData, userQuery) {
    console.log('[BEAUTIFIER] Formatting raw tool data for the UI...');

    const prompt = `
User asked:
"${userQuery}"

Tool response:
${JSON.stringify(rawData, null, 2)}

Instructions:
1. Convert the response into clean Markdown.
2. If task data is present, use a Markdown table.
3. Columns should be: ID, Title, State, Assignee, Iteration.
4. Remove HTML tags from descriptions.
5. Add a short Scrum Master style summary.
6. If a task was created, updated, or deleted, clearly mention success.
7. If no data exists, say "No tasks found."
`;

    try {
      const beautified = await generateText({
        model: gemini,
        apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
        prompt,
        system: 'You are a Scrum Master assistant who formats tool output into short, professional Markdown.'
      });

      return beautified.text;
    } catch (err) {
      console.error('[BEAUTIFIER-ERROR]', err);
      return null;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Health Endpoints
  // ─────────────────────────────────────────────────────────────
  router.get('/ping', (_req, res) => {
    res.json({
      status: 'Gemini MCP layer is alive',
      timestamp: new Date().toISOString()
    });
  });

  router.get('/', (_req, res) => {
    res.json({
      name: 'Scrum Assistant',
      capabilities: {
        tools: {
          queryTasks: true,
          getTask: true,
          createTask: true,
          updateTask: true,
          deleteTask: true
        }
      }
    });
  });

  // ─────────────────────────────────────────────────────────────
  // Chat Endpoint
  // ─────────────────────────────────────────────────────────────
  router.post('/chat', async (req, res) => {
    let capturedData = null;

    const { message, history = [] } = req.body || {};

    if (!message) {
      return res.status(400).json({ error: 'message required' });
    }

    console.log(`\n[CHAT-IN] User: "${message}"`);

    try {
      const gemini = google('gemini-3-flash-preview');
      const srv = await cds.connect.to('cy.aibtpapps.scrum.ScrumService');

      const result = await generateText({
        model: gemini,
        apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
        system: `You are the BTP APPS Scrum Master AI.

You help users query, create, update, and delete Azure DevOps tasks.

Rules:
1. If the user wants to create a new task, always use createTask.
2. If the user wants to search, show, list, or filter tasks, use queryTasks.
3. If the user wants details for one task ID, use getTask.
4. If the user wants to modify an existing task, use updateTask.
5. If the user wants to remove a task, use deleteTask.
6. Always summarize tool results clearly.
7. Use Markdown tables whenever task lists are returned.
8. Remove HTML tags from descriptions.
9. Keep responses short, friendly, and bot-like.
`,
        messages: [
          ...history.filter((m) => m.content),
          { role: 'user', content: message }
        ],
        maxSteps: 5,
        tools: {
          queryTasks: {
            description:
              'Use this only when the user wants to search, list, filter, find, show, or view tasks by state, assignee, sprint, epic, or iteration path.',
            parameters: z.object({
              state: z.string().optional(),
              assignee: z.string().optional(),
              iterationPath: z.string().optional(),
              epic: z.string().optional()
            }),
            execute: async (args) => {
              console.log('[TOOL] Picking: queryTasks', args);

              const data = await srv.send('queryTasks', args);

              capturedData = data;

              console.log(`[DEBUG] Raw queryTasks data: ${JSON.stringify(data).substring(0, 300)}...`);

              return data;
            }
          },

          getTask: {
            description:
              'Use this only when the user asks for one specific task ID and wants its details.',
            parameters: z.object({
              id: z.string()
            }),
            execute: async (args) => {
              console.log('[TOOL] Picking: getTask', args);

              const data = await srv.send('getTask', args);

              capturedData = data;

              console.log(`[DEBUG] Raw getTask data: ${JSON.stringify(data).substring(0, 300)}...`);

              return data;
            }
          },

          createTask: {
            description:
              'Use this when the user wants to create, add, open, raise, log, or make a new task in Azure DevOps.',
            parameters: z.object({
              title: z.string(),
              description: z.string().optional(),
              assignee: z.string().optional(),
              state: z.string().optional(),
              iterationPath: z.string().optional(),
              epic: z.string().optional(),
              parentId: z.string().optional()
            }),
            execute: async (args) => {
              console.log('[TOOL] Picking: createTask', args);

              const data = await srv.send('createTask', args);

              capturedData = data;

              console.log(`[DEBUG] Raw createTask data: ${JSON.stringify(data).substring(0, 300)}...`);

              return data;
            }
          },

          updateTask: {
            description:
              'Use this when the user wants to update task title, assignee, state, sprint, or description for an existing task.',
            parameters: z.object({
              id: z.string(),
              title: z.string().optional(),
              description: z.string().optional(),
              state: z.string().optional(),
              assignee: z.string().optional(),
              iterationPath: z.string().optional()
            }),
            execute: async (args) => {
              console.log('[TOOL] Picking: updateTask', args);

              const data = await srv.send('updateTask', args);

              capturedData = data;

              console.log(`[DEBUG] Raw updateTask data: ${JSON.stringify(data).substring(0, 300)}...`);

              return data;
            }
          },

          deleteTask: {
            description:
              'Use this when the user wants to delete, remove, or permanently close a task.',
            parameters: z.object({
              id: z.string()
            }),
            execute: async (args) => {
              console.log('[TOOL] Picking: deleteTask', args);

              const data = await srv.send('deleteTask', args);

              capturedData = data;

              console.log(`[DEBUG] Raw deleteTask data: ${JSON.stringify(data).substring(0, 300)}...`);

              return data;
            }
          }
        }
      });

      console.log(`[DEBUG] Final result.text: "${result.text}"`);

      let finalReply = result.text;

      // Beautify tool output if Gemini gives no text
      if ((!finalReply || finalReply.trim() === '') && capturedData) {
        finalReply = await beautifyResponse(gemini, capturedData, message);
      }

      // Last fallback
      if (!finalReply) {
        console.log('[FINAL-FALLBACK] Both AI passes failed. Using manual fallback.');

        if (Array.isArray(capturedData) && capturedData.length > 0) {
          finalReply = 'I found the following tasks:\n\n';
          finalReply += '| ID | Title | State |\n';
          finalReply += '|---|---|---|\n';

          capturedData.forEach((t) => {
            finalReply += `| ${t.id || '-'} | ${t.title || '-'} | ${t.state || '-'} |\n`;
          });
        } else if (capturedData) {
          finalReply = 'The action completed successfully.\n\n';
          finalReply += '```json\n';
          finalReply += JSON.stringify(capturedData, null, 2);
          finalReply += '\n```';
        } else {
          finalReply = 'No matching information was found.';
        }
      }

      res.json({
        reply: finalReply,
        history: [
          ...history,
          { role: 'user', content: message },
          { role: 'assistant', content: finalReply }
        ]
      });
    } catch (err) {
      console.error('[ROUTE-ERROR]', err);
      res.status(500).json({
        error: err.message || 'Communication lost with Scrum Service.'
      });
    }
  });

  // ─────────────────────────────────────────────────────────────
  // Chat UI
  // ─────────────────────────────────────────────────────────────
  router.get('/chat-ui', (_req, res) => {
    res.send(`<!DOCTYPE html>
    <html>
    <head>
      <title>Scrum Assistant</title>
      <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
      <style>
        body { font-family: -apple-system, sans-serif; background: #f0f2f5; padding: 20px; margin: 0; }
        #chat { max-width: 900px; margin: auto; background: white; border-radius: 8px; display: flex; flex-direction: column; height: 90vh; border: 1px solid #ddd; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        #msgs { flex: 1; overflow-y: auto; padding: 20px; display: flex; flex-direction: column; }
        .msg { margin-bottom: 15px; padding: 12px 18px; border-radius: 15px; max-width: 85%; font-size: 14px; line-height: 1.5; }
        .user { background: #007bff; color: white; align-self: flex-end; border-bottom-right-radius: 2px; }
        .bot { background: #f8f9fa; color: #333; align-self: flex-start; border: 1px solid #dee2e6; border-bottom-left-radius: 2px; }
        #input-box { display: flex; padding: 15px; border-top: 1px solid #ddd; background: #fff; }
        input { flex: 1; padding: 12px; border: 1px solid #ddd; border-radius: 20px; outline: none; padding-left: 20px; }
        button { margin-left: 10px; padding: 0 25px; background: #007bff; color: white; border: none; border-radius: 20px; cursor: pointer; font-weight: bold; }
        button:disabled { background: #ccc; }
        .loader { font-style: italic; color: #666; font-size: 12px; margin-top: 5px; margin-left: 10px; }
        /* Style for Markdown Tables */
        table { border-collapse: collapse; width: 100%; margin: 10px 0; font-size: 13px; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; }
      </style>
    </head>
    <body>
      <div id="chat">
        <div id="msgs"></div>
        <div id="input-box">
          <input id="in" type="text" placeholder="Ask about team progress..." onkeydown="if(event.key==='Enter') send()"/>
          <button id="send-btn" onclick="send()">Send</button>
        </div>
      </div>

      <script>
        let chatHistory = []; // Renamed to match your fetch body

        async function send() {
          const input = document.getElementById('in'); // Matches ID="in"
          const container = document.getElementById('msgs'); // Matches ID="msgs"
          const btn = document.getElementById('send-btn');
          const msg = input.value.trim();
          
          if(!msg) return;

          // 1. Add User Message
          add('user', msg);
          input.value = '';
          input.disabled = true;
          btn.disabled = true;

          // 2. SHOW BUSY INDICATOR
          const loader = document.createElement('div');
          loader.id = 'loader';
          loader.className = 'loader';
          loader.innerHTML = '<span>⏳ Gemini is analyzing Azure boards...</span>';
          container.appendChild(loader);
          container.scrollTop = container.scrollHeight;

          try {
            const response = await fetch('/mcp/chat', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ message: msg, history: chatHistory })
            });

            const data = await response.json();
            
            // 3. REMOVE BUSY INDICATOR
            const loaderElem = document.getElementById('loader');
            if(loaderElem) loaderElem.remove();

            // 4. DISPLAY REPLY
            if (data.reply) {
              add('bot', data.reply);
              chatHistory = data.history; 
            } else {
              add('bot', '⚠️ Error: No reply received from Gemini.');
            }

          } catch (err) {
            if(document.getElementById('loader')) document.getElementById('loader').remove();
            add('bot', '❌ Connection failed: ' + err.message);
          } finally {
            input.disabled = false;
            btn.disabled = false;
            input.focus();
          }
        }

        function add(role, text) {
          const div = document.createElement('div');
          div.className = 'msg ' + role;
          
          if(role === 'bot') {
            // Use marked to render the Markdown/Tables
            div.innerHTML = marked.parse(text);
          } else {
            div.textContent = text;
          }
          
          document.getElementById('msgs').appendChild(div);
          document.getElementById('msgs').scrollTop = document.getElementById('msgs').scrollHeight;
        }
      </script>
    </body>
    </html>`);
  });

  app.use('/mcp', router);

  console.log('[BOOT] Gemini-powered Scrum layer ready ✅');
});

module.exports = cds.server;

