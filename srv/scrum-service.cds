namespace cy.aibtpapps.scrum;

service ScrumService @(path: '/ScrumService') {
    // Action that will be called by MCP tools
    action queryTasks(state: String, // e.g. "In Progress", "To Do"
                      assignee: String, // e.g. "Chandan Mutyala"
                      iterationPath: String // e.g. "BTP APPS TEAM\\Sprint 1"
    ) returns array of {
        id            : String;
        title         : String;
        state         : String;
        assignee      : String;
        areaPath      : String;
        description   : String;
        iterationPath : String;
        changedDate   : DateTime;
    };

}
