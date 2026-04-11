// srv/scrum-service.js — FIXED
const cds = require("@sap/cds");

module.exports = cds.service.impl(function () {
  this.on('queryTasks', async (req) => {
    const { state, assignee, iterationPath } = req.data || {};

    const azureDest = await cds.connect.to('AZURE_BOARDS');
    const org = 'CY-Techies';
    const project = 'BTP APPS TEAM';

    let wiql = `SELECT [System.Id], [System.Title], [System.State], [System.AssignedTo], [System.AreaPath], [System.Description], [System.IterationPath]
                FROM WorkItems
                WHERE [System.TeamProject] = '${project}'`;

    if (state) wiql += ` AND [System.State] = '${state}'`;
    if (assignee) wiql += ` AND [System.AssignedTo] = '${assignee}'`;
    if (iterationPath) wiql += ` AND [System.IterationPath] = '${iterationPath}'`;
    wiql += ` ORDER BY [System.ChangedDate] DESC`;

    const wiqlRes = await azureDest.post(
      `/${org}/${encodeURIComponent(project)}/_apis/wit/wiql?api-version=7.1`,
      { query: wiql }
    );

    const workItems = wiqlRes?.workItems || wiqlRes?.data?.workItems || [];
    if (!Array.isArray(workItems) || workItems.length === 0) return [];

    const ids = workItems.map(w => w.id);
    const detailsRes = await azureDest.get(
      `/${org}/${encodeURIComponent(project)}/_apis/wit/workitems?ids=${ids.join(',')}&api-version=7.1`
    );

    const items = detailsRes?.value || detailsRes?.data?.value || [];
    if (!Array.isArray(items)) return [];

    return items.map(item => ({
      id: item.id?.toString() || '',
      title: item.fields?.['System.Title'] || '',
      state: item.fields?.['System.State'] || '',
      assignee: item.fields?.['System.AssignedTo']?.displayName || 'Unassigned',
      areaPath: item.fields?.['System.AreaPath'] || '',
      description: item.fields?.['System.Description'] || '',
      iterationPath: item.fields?.['System.IterationPath'] || '',
      changedDate: item.fields?.['System.ChangedDate'] || null
    }));
  });
});