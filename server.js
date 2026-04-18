// cds.on('bootstrap', (app) => {
//   console.log('[BOOT] bootstrap fired ✅');

//   const express = require('express');
//   const { z } = require('zod');
//   const router = express.Router();
//   router.use(express.json());

//   router.get('/ping', (_req, res) => {
//     res.json({ status: 'MCP layer is alive', timestamp: new Date().toISOString() });
//   });

//   router.get('/', (_req, res) => {
//     res.json({
//       name: 'Scrum MCP Server', version: '1.0.0',
//       protocolVersion: '2024-11-05', capabilities: { tools: {} }
//     });
//   });

//   // ─── Tool definitions ──────────────────────────────────────────────────────
//   const TOOLS = [
//     {
//       name: 'queryTasks',
//       description: 'Fetch and filter Azure DevOps tasks by state, assignee, or sprint',
//       inputSchema: {
//         type: 'object',
//         properties: {
//           state: { type: 'string', description: "e.g. 'In Progress', 'To Do', 'Done'" },
//           assignee: { type: 'string', description: "e.g. 'Chandan Mutyala'" },
//           iterationPath: { type: 'string', description: "e.g. 'BTP APPS TEAM\\\\Sprint 1'" }
//         }
//       }
//     },
//     {
//       name: 'getTask',
//       description: 'Get a single Azure DevOps task by its ID',
//       inputSchema: {
//         type: 'object',
//         required: ['id'],
//         properties: {
//           id: { type: 'string', description: 'Work item ID e.g. "317"' }
//         }
//       }
//     },
//     {
//       name: 'createTask',
//       description: 'Create a new task in Azure DevOps',
//       inputSchema: {
//         type: 'object',
//         required: ['title'],
//         properties: {
//           title: { type: 'string', description: 'Task title' },
//           description: { type: 'string', description: 'Task description' },
//           assignee: { type: 'string', description: "e.g. 'Chandan Mutyala'" },
//           state: { type: 'string', description: "e.g. 'To Do', 'In Progress'" },
//           iterationPath: { type: 'string', description: "e.g. 'BTP APPS TEAM\\\\Sprint 1'" },
//           areaPath: { type: 'string', description: "e.g. 'BTP APPS TEAM'" }
//         }
//       }
//     },
//     {
//       name: 'updateTask',
//       description: 'Update an existing Azure DevOps task',
//       inputSchema: {
//         type: 'object',
//         required: ['id'],
//         properties: {
//           id: { type: 'string', description: 'Work item ID to update' },
//           title: { type: 'string', description: 'New title' },
//           description: { type: 'string', description: 'New description' },
//           assignee: { type: 'string', description: 'New assignee display name' },
//           state: { type: 'string', description: "New state e.g. 'Done'" },
//           iterationPath: { type: 'string', description: 'New sprint path' }
//         }
//       }
//     },
//     {
//       name: 'deleteTask',
//       description: 'Delete a task from Azure DevOps by ID',
//       inputSchema: {
//         type: 'object',
//         required: ['id'],
//         properties: {
//           id: { type: 'string', description: 'Work item ID to delete' }
//         }
//       }
//     }
//   ];

//   // ─── MCP handler ───────────────────────────────────────────────────────────
//   router.post('/', async (req, res) => {
//     const { method, id, params } = req.body || {};
//     console.log('[MCP] method:', method, '| tool:', params?.name);

//     try {
//       // initialize
//       if (method === 'initialize') {
//         return res.json({
//           jsonrpc: '2.0', id,
//           result: {
//             protocolVersion: '2024-11-05',
//             serverInfo: { name: 'Scrum MCP Server', version: '1.0.0' },
//             capabilities: { tools: {} }
//           }
//         });
//       }

//       if (method === 'notifications/initialized') return res.status(204).send();

//       // tools/list
//       if (method === 'tools/list') {
//         return res.json({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
//       }

//       // tools/call
//       if (method === 'tools/call') {
//         const toolName = params?.name;
//         const args = params?.arguments || {};
//         const srv = await cds.connect.to('cy.aibtpapps.scrum.ScrumService');

//         const data = await srv.send(toolName, args);

//         return res.json({
//           jsonrpc: '2.0', id,
//           result: {
//             content: [{ type: 'text', text: JSON.stringify(data, null, 2) }]
//           }
//         });
//       }

//       return res.json({
//         jsonrpc: '2.0', id,
//         error: { code: -32601, message: `Method not found: ${method}` }
//       });

//     } catch (err) {
//       console.error('[MCP] Error:', err.message);
//       return res.json({
//         jsonrpc: '2.0', id,
//         error: { code: -32000, message: err.message }
//       });
//     }
//   });

//   // Free AI chat using groq
//   // const { z } = require('zod'); // Required for tool parameter validation

//   router.post('/chat', async (req, res) => {
//     const { message, history = [] } = req.body;
//     console.log(`\n[CHAT-IN] User: "${message}"`);

//     try {
//       const srv = await cds.connect.to('cy.aibtpapps.scrum.ScrumService');
//       const xai = createXai({ apiKey: process.env.XAI_API_KEY });

//       console.log('[AI] Initializing Grok call...');

//       const result = await generateText({
//         model: xai('grok-2-1212'),
//         system: `You are the BTP APPS Scrum Assistant. Provide reports in Markdown tables.`,
//         messages: [...history, { role: 'user', content: message }],
//         maxSteps: 5, // Allows AI to call tools multiple times
//         tools: {
//           queryTasks: {
//             description: 'Fetch and filter Azure DevOps tasks',
//             parameters: z.object({
//               state: z.string().optional(),
//               assignee: z.string().optional(),
//               iterationPath: z.string().optional()
//             }),
//             execute: async (args) => {
//               console.log(`[TOOL-CALL] queryTasks -> Params:`, args);
//               const data = await srv.send('queryTasks', args);
//               console.log(`[TOOL-RESULT] queryTasks -> Found ${data?.length || 0} tasks`);
//               return data;
//             }
//           },
//           getTask: {
//             description: 'Get a task by ID',
//             parameters: z.object({ id: z.string() }),
//             execute: async ({ id }) => {
//               console.log(`[TOOL-CALL] getTask -> ID: ${id}`);
//               const data = await srv.send('getTask', { id });
//               console.log(`[TOOL-RESULT] getTask -> ${data ? 'Found' : 'Not Found'}`);
//               return data;
//             }
//           }
//         },
//         // Log steps for debugging tool-calling loops
//         onStepFinish: (step) => {
//           console.log(`[AI-STEP] Finish. Tool calls in this step: ${step.toolCalls.length}`);
//         }
//       });

//       console.log(`[CHAT-OUT] Tokens used: ${result.usage.totalTokens} | Response length: ${result.text.length}`);

//       res.json({
//         reply: result.text,
//         history: [...history, { role: 'user', content: message }, { role: 'assistant', content: result.text }]
//       });

//     } catch (err) {
//       console.error('[CHAT-ERROR]', err);
//       res.status(500).json({ error: 'AI processing failed', details: err.message });
//     }
//   });


//   // Serve the chat UI
//   router.get('/chat-ui', (_req, res) => {
//     res.send(`<!DOCTYPE html>
// <html>
// <head>
//   <title>Scrum Master AI Assistant</title>
//   <style>
//     * { box-sizing: border-box; margin: 0; padding: 0; font-family: sans-serif; }
//     body { background: #f4f4f8; display: flex; flex-direction: column; height: 100vh; }
//     header { background: #0070f3; color: white; padding: 16px 24px; font-size: 18px; font-weight: 500; }
//     #messages { flex: 1; overflow-y: auto; padding: 24px; display: flex; flex-direction: column; gap: 12px; }    
//     .msg { max-width: 75%; padding: 12px 16px; border-radius: 12px; line-height: 1.5; font-size: 14px; white-space: pre-wrap; }
//     .user { background: #0070f3; color: white; align-self: flex-end; border-radius: 12px 12px 2px 12px; }
//     .bot  { background: white; font-family: 'Courier New', Courier, monospace; color: #333; align-self: flex-start; border-radius: 12px 12px 12px 2px; border: 1px solid #e0e0e0; }
//     .typing { color: #999; font-style: italic; font-size: 13px; }
//     #input-row { display: flex; gap: 8px; padding: 16px 24px; background: white; border-top: 1px solid #e0e0e0; }
//     #msg-input { flex: 1; padding: 12px 16px; border: 1px solid #e0e0e0; border-radius: 8px; font-size: 14px; outline: none; }
//     #msg-input:focus { border-color: #0070f3; }
//     button { background: #0070f3; color: white; border: none; padding: 12px 20px; border-radius: 8px; cursor: pointer; font-size: 14px; }
//     button:hover { background: #0060df; }
//     button:disabled { background: #ccc; cursor: not-allowed; }
//     .suggestions { display: flex; flex-wrap: wrap; gap: 8px; padding: 0 24px 12px; }
//     .chip { background: white; border: 1px solid #0070f3; color: #0070f3; padding: 6px 14px;
//             border-radius: 20px; font-size: 12px; cursor: pointer; }
//     .chip:hover { background: #e8f0fe; }
//   </style>
// </head>
// <body>
//   <header>Scrum Master AI Assistant — BTP APPS TEAM</header>
//   <div id="messages">
//     <div class="msg bot">Hi! I am your Scrum Master assistant. Ask me about tasks, weekly reports, team status, or anything about your Azure Boards.</div>
//   </div>
//   <div class="suggestions">
//     <span class="chip" onclick="ask('Show me the whole team weekly report')">Team weekly report</span>
//     <span class="chip" onclick="ask('What is Chandan working on?')">Chandan tasks</span>
//     <span class="chip" onclick="ask('How many tasks are In Progress?')">In Progress count</span>
//     <span class="chip" onclick="ask('Who has the most tasks?')">Most active member</span>
//     <span class="chip" onclick="ask('Show all Done tasks in Sprint 1')">Done in Sprint 1</span>
//   </div>
//   <div id="input-row">
//     <input id="msg-input" placeholder="Ask about tasks, reports, team status..." onkeydown="if(event.key==='Enter') send()"/>
//     <button id="send-btn" onclick="send()">Send</button>
//   </div>
//   <script>
//     const msgs = document.getElementById('messages');
//     const input = document.getElementById('msg-input');
//     const btn = document.getElementById('send-btn');

//     function addMsg(text, role) {
//       const d = document.createElement('div');
//       d.className = 'msg ' + role;
//       d.textContent = text;
//       msgs.appendChild(d);
//       msgs.scrollTop = msgs.scrollHeight;
//       return d;
//     }

//     async function ask(text) {
//       input.value = text;
//       await send();
//     }

//     let chatHistory = [];

// async function send() {
//   const text = input.value.trim();
//   if (!text) return;
//   input.value = '';
//   btn.disabled = true;

//   addMsg(text, 'user');
//   const typing = addMsg('Thinking...', 'bot typing');

//   try {
//     const res = await fetch('/mcp/chat', {
//       method: 'POST',
//       headers: { 'Content-Type': 'application/json' },
//       body: JSON.stringify({ message: text, history: chatHistory })
//     });
//     const data = await res.json();
//     typing.textContent = data.reply || 'No response';
//     typing.className = 'msg bot';

//     // Save history for next turn
//     if (data.history) chatHistory = data.history;

//   } catch(e) {
//     typing.textContent = 'Error: ' + e.message;
//     typing.className = 'msg bot';
//   }
//   btn.disabled = false;
//   input.focus();
// }
//   </script>
// </body>
// </html>`);
//   });

//   app.use('/mcp', router);
//   console.log('[BOOT] /mcp CRUD routes mounted ✅');
// });

// module.exports = cds.server;



const cds = require('@sap/cds');
const express = require('express');
const { google } = require('@ai-sdk/google');
const { generateText } = require('ai');
const { z } = require('zod');

cds.on('bootstrap', (app) => {
  console.log('[BOOT] bootstrap fired ✅');

  const router = express.Router();
  router.use(express.json());


  // --- NEW HELPER FUNCTION ---
async function beautifyResponse(gemini, rawData, userQuery) {
    console.log("[BEAUTIFIER] Formatting raw Azure data for the UI...");
    
    const prompt = `
        User asked: "${userQuery}"
        I have retrieved the following raw JSON data from Azure DevOps:
        ${JSON.stringify(rawData)}

        Your task:
        1. Summarize this data into a professional Markdown table.
        2. Columns: ID, Title, State, and Iteration.
        3. Clean up any HTML tags found in descriptions (like <div> or <span>).
        4. Add a brief, encouraging summary as a Scrum Master would.
        5. If the data is empty, say "No tasks found."
    `;

    try {
        const beautified = await generateText({
            model: gemini,
            prompt: prompt,
            system: "You are an expert Scrum Master and data formatter. You only output clean Markdown."
        });
        return beautified.text;
    } catch (err) {
        console.error("[BEAUTIFIER-ERROR]", err);
        return null;
    }
}

  // ─── HEALTH & MCP DISCOVERY ──────────────────────────────────────────────
  router.get('/ping', (_req, res) => {
    res.json({ status: 'Gemini MCP layer is alive', timestamp: new Date().toISOString() });
  });

  router.get('/', (_req, res) => {
    res.json({ name: 'Scrum Assistant', capabilities: { tools: {} } });
  });

  // ─── AI CHAT AGENT (Gemini Tool-Calling) ──────────────────────────────────
  router.post('/chat', async (req, res) => {
    let capturedData = null;
    const { message, history = [] } = req.body || {};
    if (!message) return res.status(400).json({ error: 'message required' });

    console.log(`\n[CHAT-IN] User: "${message}"`);

    try {
      // Initialize Gemini with your API Key
const gemini = google('gemini-3-flash-preview');
      const srv = await cds.connect.to('cy.aibtpapps.scrum.ScrumService');

      const result = await generateText({
        model: gemini,
        apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
        system: `You are the BTP APPS Scrum Master AI. 
        IMPORTANT: The data returned from the tools contains HTML formatting. 
        Your job is to:
        1. Parse the HTML and extract the meaningful text (ignore tags like <div>, <p>, etc.).
        2. Summarize the task information clearly.
        3. Present your final answer using Markdown tables. 
        4. If a task description is long, provide a concise summary.`,
        messages: [
          ...history.filter(m => m.content), 
          { role: 'user', content: message }
        ],
        maxSteps: 5, // Vital: allows Gemini to call a tool and then speak
        tools: {
          queryTasks: {
            description: 'Fetch/filter Azure tasks by state, assignee, or sprint',
            parameters: z.object({
              state: z.string().optional(),
              assignee: z.string().optional(),
              iterationPath: z.string().optional()
            }),
            execute: async (args) => {
              console.log('[TOOL] Picking: queryTasks', args);
              // return await srv.send('queryTasks', args);
              const data = await srv.send('queryTasks', args);

              const finaldata = JSON.stringify(data) ;

              console.log('my idea based log data: ',JSON.stringify(data));

              capturedData = JSON.stringify(data);
              
              // Log a snippet to console for debugging
              console.log(`[DEBUG] Raw data sample: ${JSON.stringify(data).substring(0, 100)}...`);
              return data;
            }
          },
          getTask: {
            description: 'Get a single Azure task by its ID',
            parameters: z.object({ id: z.string() }),
            execute: async (args) => {
              console.log('[TOOL] Picking: getTask', args);
              return await srv.send('getTask', args);
            }
          },
          createTask: {
            description: 'Create a new task in Azure DevOps',
            parameters: z.object({
              title: z.string(),
              description: z.string().optional(),
              assignee: z.string().optional(),
              state: z.string().optional()
            }),
            execute: async (args) => {
              console.log('[TOOL] Picking: createTask', args);
              return await srv.send('createTask', args);
            }
          },
          updateTask: {
            description: 'Update an existing task',
            parameters: z.object({
              id: z.string(),
              title: z.string().optional(),
              state: z.string().optional(),
              assignee: z.string().optional()
            }),
            execute: async (args) => {
              console.log('[TOOL] Picking: updateTask', args);
              return await srv.send('updateTask', args);
            }
          },
          deleteTask: {
            description: 'Delete a task by ID',
            parameters: z.object({ id: z.string() }),
            execute: async (args) => {
              console.log('[TOOL] Picking: deleteTask', args);
              return await srv.send('deleteTask', args);
            }
          }
        }
      });

      // --- LOGGING FOR DEBUGGING ---
    console.log(`[DEBUG] Final result.text: "${result.text}"`);

    // --- CRITICAL FALLBACK LOGIC ---
   let finalReply = result.text;

        // PASS 2: If the AI was silent but we have data, BEAUTIFY IT
        if ((!finalReply || finalReply.trim() === "") && capturedData) {
            finalReply = await beautifyResponse(gemini, capturedData, message);
        }

        // LAST RESORT: If everything AI-related fails, use a hardcoded table
        if (!finalReply) {
            console.log("[FINAL-FALLBACK] Both AI passes failed. Using manual string builder.");
            finalReply = "I found the tasks but encountered a formatting error. \n\n" + 
                         capturedData.map(t => `- [${t.id}] ${t.title} (${t.state})`).join('\n');
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
        res.status(500).json({ error: "Communication lost with Scrum Service." });
    }
  });

  // ─── CHAT UI ───────────────────────────────────────────────────────────────
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


// const cds = require('@sap/cds');
// const { google } = require('@ai-sdk/google'); // Use Google provider
// const express = require('express');
// const { createXai } = require('@ai-sdk/xai');
// const { generateText } = require('ai');
// const { z } = require('zod');

// cds.on('bootstrap', (app) => {
//   console.log('[BOOT] bootstrap fired ✅');

//   const router = express.Router();
//   router.use(express.json());

//   // ─── TOOL DEFINITIONS FOR MCP ──────────────────────────────────────────────
//   const TOOLS = [
//     {
//       name: 'queryTasks',
//       description: 'Fetch and filter Azure DevOps tasks by state, assignee, or sprint',
//       inputSchema: {
//         type: 'object',
//         properties: {
//           state: { type: 'string', description: "e.g. 'In Progress', 'To Do', 'Done'" },
//           assignee: { type: 'string', description: "e.g. 'Chandan Mutyala'" },
//           iterationPath: { type: 'string', description: "e.g. 'BTP APPS TEAM\\Sprint 1'" }
//         }
//       }
//     },
//     {
//       name: 'getTask',
//       description: 'Get a single Azure DevOps task by its ID',
//       inputSchema: {
//         type: 'object',
//         required: ['id'],
//         properties: { id: { type: 'string' } }
//       }
//     },
//     {
//       name: 'createTask',
//       description: 'Create a new task in Azure DevOps',
//       inputSchema: {
//         type: 'object',
//         required: ['title'],
//         properties: {
//           title: { type: 'string' },
//           description: { type: 'string' },
//           assignee: { type: 'string' },
//           state: { type: 'string' }
//         }
//       }
//     }
//   ];

//   // ─── HEALTH CHECKS ──────────────────────────────────────────────────────────
//   router.get('/ping', (_req, res) => {
//     res.json({ status: 'MCP layer is alive', timestamp: new Date().toISOString() });
//   });

//   router.get('/', (_req, res) => {
//     res.json({
//       name: 'Scrum MCP Server',
//       version: '1.0.0',
//       capabilities: { tools: {} }
//     });
//   });

//   // ─── MCP PROTOCOL HANDLER (Standard JSON-RPC) ──────────────────────────────
//   router.post('/', async (req, res) => {
//     const { method, id, params } = req.body || {};
//     console.log(`[MCP] Request -> Method: ${method} | Tool: ${params?.name || 'N/A'}`);

//     try {
//       const srv = await cds.connect.to('cy.aibtpapps.scrum.ScrumService');

//       if (method === 'initialize') {
//         return res.json({ jsonrpc: '2.0', id, result: { protocolVersion: '2024-11-05', serverInfo: { name: 'Scrum Server' } } });
//       }

//       if (method === 'tools/list') {
//         return res.json({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
//       }

//       if (method === 'tools/call') {
//         const { name, arguments: args } = params;
//         console.log(`[MCP] Executing Tool: ${name} with args:`, JSON.stringify(args));
//         const data = await srv.send(name, args);
//         return res.json({
//           jsonrpc: '2.0', id,
//           result: { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
//         });
//       }

//       res.json({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } });
//     } catch (err) {
//       console.error('[MCP-ERROR]', err.message);
//       res.status(500).json({ jsonrpc: '2.0', id, error: { message: err.message } });
//     }
//   });

//   // ─── AI CHAT AGENT (xAI Tool-Calling) ──────────────────────────────────────
//   router.post('/chat', async (req, res) => {
//     const { message, history = [] } = req.body || {};
//     if (!message) return res.status(400).json({ error: 'message required' });

//     console.log(`\n[CHAT-IN] User: "${message}"`);

//     try {
//       const xai = createXai({ apiKey: process.env.XAI_API_KEY });
//       const srv = await cds.connect.to('cy.aibtpapps.scrum.ScrumService');

//       const result = await generateText({
//         model: xai('grok-2-1212'), // Use your preferred Grok version
//         system: `You are the BTP APPS Scrum Master AI. 
//         You provide clear status reports using Markdown tables.
//         Always check the boards via tools if asked about tasks or progress.`,
//         messages: [...history, { role: 'user', content: message }],
//         maxSteps: 5,
//         tools: {
//           queryTasks: {
//             description: 'Fetch and filter Azure DevOps tasks',
//             parameters: z.object({
//               state: z.string().optional(),
//               assignee: z.string().optional(),
//               iterationPath: z.string().optional()
//             }),
//             execute: async (args) => {
//               console.log('[TOOL-CALL] queryTasks:', args);
//               const data = await srv.send('queryTasks', args);
//               console.log(`[TOOL-RESULT] Found ${data?.length || 0} tasks`);
//               return data;
//             }
//           },
//           getTask: {
//             description: 'Get a single task by ID',
//             parameters: z.object({ id: z.string() }),
//             execute: async ({ id }) => {
//               console.log('[TOOL-CALL] getTask ID:', id);
//               return await srv.send('getTask', { id });
//             }
//           }
//         },
//         onStepFinish: (step) => {
//           console.log(`[AI-STEP] Finish. Tool calls: ${step.toolCalls.length}`);
//         }
//       });

//       console.log(`[CHAT-OUT] Response length: ${result.text.length}`);

//       res.json({
//         reply: result.text,
//         history: [
//           ...history,
//           { role: 'user', content: message },
//           { role: 'assistant', content: result.text }
//         ]
//       });

//     } catch (err) {
//     // --- THE DEEP DEBUG LOG ---
//       console.error('[CHAT-ERROR] Detailed Breakdown:');
//       console.error('Message:', err.message);
      
//       if (err.responseBody) {
//         console.error('API Response Body:', err.responseBody); // THIS tells us exactly why xAI rejected it
//       }
      
//       if (err.data) {
//         console.error('API Data:', JSON.stringify(err.data, null, 2));
//       }

//       res.status(500).json({ 
//         error: 'AI_APICallError', 
//         details: err.message,
//         hint: 'Check logs for responseBody'
//       });
//     }
//   });

//   // ─── CHAT UI ───────────────────────────────────────────────────────────────
//   router.get('/chat-ui', (_req, res) => {
//     res.send(`<!DOCTYPE html>
//     <html>
//     <head>
//       <title>Scrum Assistant</title>
//       <style>
//         body { font-family: -apple-system, sans-serif; background: #f0f2f5; padding: 20px; }
//         #chat { max-width: 800px; margin: auto; background: white; border-radius: 8px; display: flex; flex-direction: column; height: 80vh; border: 1px solid #ddd; }
//         #msgs { flex: 1; overflow-y: auto; padding: 20px; }
//         .msg { margin-bottom: 15px; padding: 10px 15px; border-radius: 10px; max-width: 80%; white-space: pre-wrap; font-size: 14px; line-height: 1.4; }
//         .user { background: #007bff; color: white; align-self: flex-end; margin-left: auto; }
//         .bot { background: #e9ecef; color: #333; align-self: flex-start; }
//         #input-box { display: flex; padding: 15px; border-top: 1px solid #ddd; }
//         input { flex: 1; padding: 10px; border: 1px solid #ddd; border-radius: 4px; }
//         button { margin-left: 10px; padding: 10px 20px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; }
//       </style>
//     </head>
//     <body>
//       <div id="chat">
//         <div id="msgs"></div>
//         <div id="input-box">
//           <input id="in" type="text" placeholder="Ask about team progress..." onkeydown="if(event.key==='Enter') send()"/>
//           <button onclick="send()">Send</button>
//         </div>
//       </div>
//       <script>
//         let history = [];
//         async function send() {
//           const input = document.getElementById('in');
//           const val = input.value; if(!val) return;
//           input.value = '';
//           add('user', val);
          
//           const res = await fetch('/mcp/chat', {
//             method: 'POST',
//             headers: { 'Content-Type': 'application/json' },
//             body: JSON.stringify({ message: val, history })
//           });
//           const data = await res.json();
//           add('bot', data.reply);
//           history = data.history;
//         }
//         function add(role, text) {
//           const div = document.createElement('div');
//           div.className = 'msg ' + role;
//           div.textContent = text;
//           document.getElementById('msgs').appendChild(div);
//           document.getElementById('msgs').scrollTop = 99999;
//         }
//       </script>
//     </body>
//     </html>`);
//   });

//   app.use('/mcp', router);
//   console.log('[BOOT] /mcp CRUD and Chat routes mounted ✅');
// });

// module.exports = cds.server;