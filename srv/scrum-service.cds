namespace cy.aibtpapps.scrum;

service ScrumService @(path: '/ScrumService') {

    // READ
    action queryTasks(state: String,
                      assignee: String,
                      iterationPath: String)          returns array of TaskResult;

    // CREATE
    action createTask(title: String,
                      description: String,
                      assignee: String,
                      state: String,
                      iterationPath: String,
                      areaPath: String)               returns TaskResult;

    // UPDATE
    action updateTask(id: String,
                      title: String,
                      description: String,
                      assignee: String,
                      state: String,
                      iterationPath: String)          returns TaskResult;

    // DELETE
    action deleteTask(id: String)                     returns {
        success : Boolean;
        message : String
    };

    // GET SINGLE
    action getTask(id: String)                        returns TaskResult;

    action getWeeklyReport(assignee: String,
                           weekOffset: Integer)       returns WeeklyReport;

    // TEAM REPORT — whole team
    action getTeamWeeklyReport(weekOffset: Integer,
                               iterationPath: String) returns array of WeeklyReport;


}

type TaskResult {
    id            : String;
    title         : String;
    state         : String;
    assignee      : String;
    areaPath      : String;
    description   : String;
    iterationPath : String;
    changedDate   : DateTime;
}


type TaskSummary {
    id            : String;
    title         : String;
    state         : String;
    iterationPath : String;
    changedDate   : DateTime;
}

type WeeklyReport {
    assignee   : String;
    weekStart  : String;
    weekEnd    : String;
    totalTasks : Integer;
    inProgress : Integer;
    done       : Integer;
    toDo       : Integer;
    tasks      : array of TaskSummary;
    summary    : String; // AI-generated narrative
}
