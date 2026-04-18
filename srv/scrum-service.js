'use strict';
const cds = require('@sap/cds');

module.exports = cds.service.impl(function () {

  const ORG = 'CY-Techies';
  const PROJECT = 'BTP APPS TEAM';
  const API_VERSION = 'api-version=7.1';

  // Helper — map raw work item to clean object
  const mapItem = (item) => ({
    id: item.id?.toString() || '',
    title: item.fields?.['System.Title'] || '',
    state: item.fields?.['System.State'] || '',
    assignee: item.fields?.['System.AssignedTo']?.displayName || 'Unassigned',
    areaPath: item.fields?.['System.AreaPath'] || '',
    description: item.fields?.['System.Description'] || '',
    iterationPath: item.fields?.['System.IterationPath'] || '',
    changedDate: item.fields?.['System.ChangedDate'] || null
  });

  // Helper — get azure destination
  const getAzure = () => cds.connect.to('AZURE_BOARDS');


  // ─── Helper: compute week date range ────────────────────────────────────────
  function getWeekRange(weekOffset = 0) {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon...
    const monday = new Date(now);
    monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1) - (weekOffset * 7));
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    return {
      start: monday.toISOString(),
      end: sunday.toISOString(),
      startLabel: monday.toISOString().split('T')[0],
      endLabel: sunday.toISOString().split('T')[0]
    };
  }

  // ─── Helper: fetch tasks for a person in date range ─────────────────────────
  async function fetchTasksForPerson(azure, assignee, weekRange, iterationPath) {
    const ORG = 'CY-Techies';
    const PROJECT = 'BTP APPS TEAM';
    const API_VERSION = 'api-version=7.1';

    let wiql = `SELECT [System.Id] FROM WorkItems
              WHERE [System.TeamProject] = '${PROJECT}'
              AND [System.ChangedDate] >= '${weekRange.start}'
              AND [System.ChangedDate] <= '${weekRange.end}'
              AND [System.State] IN ('In Progress', 'Done', 'To Do')`;

    if (assignee) wiql += ` AND [System.AssignedTo] = '${assignee}'`;
    if (iterationPath) wiql += ` AND [System.IterationPath] = '${iterationPath}'`;
    wiql += ` ORDER BY [System.ChangedDate] DESC`;

    const wiqlRes = await azure.post(
      `/${ORG}/${encodeURIComponent(PROJECT)}/_apis/wit/wiql?${API_VERSION}`,
      { query: wiql }
    );

    const workItems = wiqlRes?.workItems || wiqlRes?.data?.workItems || [];
    if (!Array.isArray(workItems) || workItems.length === 0) return [];

    const ids = workItems.map(w => w.id);
    console.log(`[CAP] fetchTasksForPerson(${assignee}): ${ids.length} items, batching`);

    // ✅ Batched fetch
    const items = await fetchItemDetails(azure, ids);

    return items.map(item => ({
      id: item.id?.toString() || '',
      title: item.fields?.['System.Title'] || '',
      state: item.fields?.['System.State'] || '',
      assignee: item.fields?.['System.AssignedTo']?.displayName || 'Unassigned',
      iterationPath: item.fields?.['System.IterationPath'] || '',
      changedDate: item.fields?.['System.ChangedDate'] || null
    }));
  }

  // ── Helper: chunk array into batches ────────────────────────────────────────
  function chunkArray(arr, size) {
    const chunks = [];
    for (let i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size));
    }
    return chunks;
  }

  // ── Helper: fetch work item details in batches of 100 ───────────────────────
  async function fetchItemDetails(azure, ids) {
    const ORG = 'CY-Techies';
    const PROJECT = 'BTP APPS TEAM';
    const API_VERSION = 'api-version=7.1';

    if (!ids || ids.length === 0) return [];

    const batches = chunkArray(ids, 100); // Azure limit is 200, use 100 to be safe
    const allItems = [];

    for (const batch of batches) {
      const detailsRes = await azure.get(
        `/${ORG}/${encodeURIComponent(PROJECT)}/_apis/wit/workitems?ids=${batch.join(',')}&$expand=all&${API_VERSION}`
      );
      const items = detailsRes?.value || detailsRes?.data?.value || [];
      if (Array.isArray(items)) allItems.push(...items);
    }

    return allItems;
  }

  // ─── Helper: build report object from tasks ──────────────────────────────────
  function buildReport(assignee, tasks, weekRange) {
    const inProgress = tasks.filter(t => t.state === 'In Progress');
    const done = tasks.filter(t => t.state === 'Done');
    const toDo = tasks.filter(t => t.state === 'To Do');

    const summary = [
      `${assignee} — Week of ${weekRange.startLabel} to ${weekRange.endLabel}.`,
      `Total activity: ${tasks.length} task(s) updated.`,
      done.length ? `Completed ${done.length} task(s): ${done.map(t => `"${t.title}"`).join(', ')}.` : '',
      inProgress.length ? `In Progress (${inProgress.length}): ${inProgress.map(t => `"${t.title}"`).join(', ')}.` : '',
      toDo.length ? `Queued/To Do (${toDo.length}): ${toDo.map(t => `"${t.title}"`).join(', ')}.` : '',
    ].filter(Boolean).join(' ');

    return {
      assignee,
      weekStart: weekRange.startLabel,
      weekEnd: weekRange.endLabel,
      totalTasks: tasks.length,
      inProgress: inProgress.length,
      done: done.length,
      toDo: toDo.length,
      tasks: tasks.map(t => ({
        id: t.id, title: t.title, state: t.state,
        iterationPath: t.iterationPath, changedDate: t.changedDate
      })),
      summary
    };
  }


  // ─── INDIVIDUAL WEEKLY REPORT ────────────────────────────────────────────────
  this.on('getWeeklyReport', async (req) => {
    const { assignee, weekOffset = 1 } = req.data || {};
    if (!assignee) return req.error(400, 'assignee is required');

    const azure = await getAzure();
    const weekRange = getWeekRange(weekOffset);
    const tasks = await fetchTasksForPerson(azure, assignee, weekRange, null);

    console.log(`[CAP] Weekly report for ${assignee}: ${tasks.length} tasks`);
    return buildReport(assignee, tasks, weekRange);
  });

  // ─── TEAM WEEKLY REPORT ──────────────────────────────────────────────────────
  this.on('getTeamWeeklyReport', async (req) => {
    const { weekOffset = 1, iterationPath } = req.data || {};

    const azure = await getAzure();
    const weekRange = getWeekRange(weekOffset);

    // Fetch ALL tasks for the week first
    const allTasks = await fetchTasksForPerson(azure, null, weekRange, iterationPath);

    // Group by assignee
    const byAssignee = {};
    for (const task of allTasks) {
      const name = task.assignee || 'Unassigned';
      if (!byAssignee[name]) byAssignee[name] = [];
      byAssignee[name].push(task);
    }

    // Build a report per person
    const reports = Object.entries(byAssignee).map(([name, tasks]) =>
      buildReport(name, tasks, weekRange)
    );

    // Sort by most active first
    reports.sort((a, b) => b.totalTasks - a.totalTasks);

    console.log(`[CAP] Team weekly report: ${reports.length} members, ${allTasks.length} total tasks`);
    return reports;
  });



  // ─── READ — query multiple tasks ───────────────────────────────────────────
  this.on('queryTasks', async (req) => {
    const { state, assignee, iterationPath } = req.data || {};
    const azure = await getAzure();

    // Use a cleaner query for the AI
    let wiql = `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = '${PROJECT}'`;
    if (state) wiql += ` AND [System.State] = '${state}'`;
    if (assignee) wiql += ` AND [System.AssignedTo] = '${assignee}'`;
    if (iterationPath) wiql += ` AND [System.IterationPath] = '${iterationPath}'`;
    wiql += ` ORDER BY [System.ChangedDate] DESC`;

    const wiqlRes = await azure.post(`/${ORG}/${encodeURIComponent(PROJECT)}/_apis/wit/wiql?${API_VERSION}`, { query: wiql });
    const workItems = wiqlRes?.workItems || wiqlRes?.data?.workItems || [];

    if (workItems.length === 0) return [];

    // --- ADJUSTMENT: LIMIT DATA FOR AI ---
    // We only take the top 20 items. This prevents the "Blank Response" issue
    // caused by too many tokens being sent to the AI at once.
    const ids = workItems.slice(0, 20).map(w => w.id);
    console.log(`[CAP] queryTasks: Found ${workItems.length}, processing top ${ids.length} for AI.`);

    const items = await fetchItemDetails(azure, ids);
    return items.map(mapItem);
  });

  // ─── READ — get single task ─────────────────────────────────────────────────
  this.on('getTask', async (req) => {
    const { id } = req.data || {};
    if (!id) return req.error(400, 'id is required');

    const azure = await getAzure();
    const item = await azure.get(
      `/${ORG}/${encodeURIComponent(PROJECT)}/_apis/wit/workitems/${id}?$expand=all&${API_VERSION}`
    );

    if (!item) return req.error(404, `Task ${id} not found`);
    return mapItem(item?.data || item);
  });

  // ─── CREATE ─────────────────────────────────────────────────────────────────
  this.on('createTask', async (req) => {
    const { title, description, assignee, state, iterationPath, areaPath } = req.data || {};
    if (!title) return req.error(400, 'title is required');

    const azure = await getAzure();

    // Azure DevOps PATCH document format for create
    const patchDoc = [];

    patchDoc.push({ op: 'add', path: '/fields/System.Title', value: title });

    if (description)
      patchDoc.push({ op: 'add', path: '/fields/System.Description', value: description });

    if (state)
      patchDoc.push({ op: 'add', path: '/fields/System.State', value: state });

    if (assignee)
      patchDoc.push({ op: 'add', path: '/fields/System.AssignedTo', value: assignee });

    if (iterationPath)
      patchDoc.push({ op: 'add', path: '/fields/System.IterationPath', value: iterationPath });

    if (areaPath)
      patchDoc.push({ op: 'add', path: '/fields/System.AreaPath', value: areaPath });

    const result = await azure.send({
      method: 'POST',
      path: `/${ORG}/${encodeURIComponent(PROJECT)}/_apis/wit/workitems/$Task?${API_VERSION}`,
      headers: { 'Content-Type': 'application/json-patch+json' },
      data: patchDoc
    });

    const created = result?.data || result;
    console.log('[CAP] Task created:', created?.id);
    return mapItem(created);
  });

  // ─── UPDATE ─────────────────────────────────────────────────────────────────
  this.on('updateTask', async (req) => {
    const { id, title, description, assignee, state, iterationPath } = req.data || {};
    if (!id) return req.error(400, 'id is required');

    const azure = await getAzure();
    const patchDoc = [];

    if (title)
      patchDoc.push({ op: 'replace', path: '/fields/System.Title', value: title });

    if (description)
      patchDoc.push({ op: 'replace', path: '/fields/System.Description', value: description });

    if (state)
      patchDoc.push({ op: 'replace', path: '/fields/System.State', value: state });

    if (assignee)
      patchDoc.push({ op: 'replace', path: '/fields/System.AssignedTo', value: assignee });

    if (iterationPath)
      patchDoc.push({ op: 'replace', path: '/fields/System.IterationPath', value: iterationPath });

    if (patchDoc.length === 0)
      return req.error(400, 'No fields to update provided');

    const result = await azure.send({
      method: 'PATCH',
      path: `/${ORG}/${encodeURIComponent(PROJECT)}/_apis/wit/workitems/${id}?${API_VERSION}`,
      headers: { 'Content-Type': 'application/json-patch+json' },
      data: patchDoc
    });

    const updated = result?.data || result;
    console.log('[CAP] Task updated:', id);
    return mapItem(updated);
  });

  // ─── DELETE ─────────────────────────────────────────────────────────────────
  this.on('deleteTask', async (req) => {
    const { id } = req.data || {};
    if (!id) return req.error(400, 'id is required');

    const azure = await getAzure();

    await azure.send({
      method: 'DELETE',
      path: `/${ORG}/${encodeURIComponent(PROJECT)}/_apis/wit/workitems/${id}?${API_VERSION}`
    });

    console.log('[CAP] Task deleted:', id);
    return { success: true, message: `Task ${id} deleted successfully` };
  });

});