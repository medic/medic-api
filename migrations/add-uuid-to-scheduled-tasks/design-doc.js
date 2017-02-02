
var map = function(doc) {
  var now = new Date(),
      match = false;
  //var now = new Date('2017-01-06T12:00:00.000Z');
  if (doc &&
      doc.type === 'data_record' &&
      doc.form &&
      doc.scheduled_tasks) {
    doc.scheduled_tasks.forEach(function(task) {
      if (now.valueOf() < new Date(task.due).valueOf()) {
        //log("now is " + now.valueOf());
        //log("task.due is " + new Date(task.due).valueOf());
        task.messages.forEach(function(msg) {
          if (!msg.uuid) {
            match = true;
          }
        });
      }
    });
  }
  if (match) {
    emit();
  }
};
console.log(JSON.stringify({
  _id: "_design/migrations-add-uuid-to-scheduled-tasks",
  views: {
    "scheduled-tasks-no-uuids": {
      map: map.toString() //module.exports.toString()
    }
  }
}));
