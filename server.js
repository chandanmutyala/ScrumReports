'use strict';
const cds = require('@sap/cds');

console.log('[BOOT] server.js loaded');

cds.on('bootstrap', (app) => {
    console.log('[BOOT] bootstrap fired ✅');

    const express = require('express');
    const router = express.Router();

    // ✅ ADD THIS — parses JSON body for all /mcp routes
    router.use(express.json());

    router.get('/ping', (_req, res) => {
        console.log('[MCP] ping hit ✅');
        res.json({ status: 'MCP layer is alive', timestamp: new Date().toISOString() });
    });

    router.post('/', async (req, res) => {
        const { method, id, params } = req.body || {};
        console.log('[MCP] incoming method:', method);

        try {
            if (method === 'initialize') {
                return res.json({
                    jsonrpc: '2.0', id,
                    result: {
                        protocolVersion: '2024-11-05',
                        serverInfo: { name: 'Scrum MCP Server', version: '1.0.0' },
                        capabilities: { tools: {} }
                    }
                });
            }

            if (method === 'notifications/initialized') {
                return res.status(204).send();
            }

            if (method === 'tools/list') {
                return res.json({
                    jsonrpc: '2.0', id,
                    result: {
                        tools: [{
                            name: 'queryTasks',
                            description: 'Fetch Azure DevOps work items filtered by state, assignee, or sprint',
                            inputSchema: {
                                type: 'object',
                                properties: {
                                    state: { type: 'string', description: "e.g. 'In Progress', 'To Do', 'Done'" },
                                    assignee: { type: 'string', description: "e.g. 'Chandan Mutyala'" },
                                    iterationPath: { type: 'string', description: "e.g. 'BTP APPS TEAM\\\\Sprint 1'" }
                                }
                            }
                        }]
                    }
                });
            }

            if (method === 'tools/call' && params?.name === 'queryTasks') {
                console.log('[MCP] queryTasks args:', JSON.stringify(params.arguments));

                // ✅ For local CAP services use cds.serve / direct action call
                const srv = await cds.connect.to('cy.aibtpapps.scrum.ScrumService');
                const data = await srv.send('queryTasks', params.arguments || {});

                return res.json({
                    jsonrpc: '2.0', id,
                    result: {
                        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }]
                    }
                });
            }

            return res.json({
                jsonrpc: '2.0', id,
                error: { code: -32601, message: `Method not found: ${method}` }
            });

        } catch (err) {
            console.error('[MCP] Error:', err.message);
            return res.json({
                jsonrpc: '2.0', id,
                error: { code: -32000, message: err.message }
            });
        }
    });

    app.use('/mcp', router);
    console.log('[BOOT] /mcp routes mounted ✅');
});

module.exports = cds.server;