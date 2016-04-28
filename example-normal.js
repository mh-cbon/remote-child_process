
var spawn       = require('child_process').spawn;


console.log('\n-------------------------------------------------------\n');

var child = spawn(process.argv[0], [__dirname + '/utils/inquirer.js'], {stdio: 'pipe'});

process.stdin.pipe(child.stdin);
child.stdout.pipe(process.stdout);
child.stderr.pipe(process.stderr);

child.on('started', function () {
  console.log('started');
  console.log("pid=%s", child.pid);
})

child.on('error', function (err) {
  console.log(err);
})

child.on('exit', function () {
  console.log("exited");
  console.log(arguments);
})

child.on('close', function () {
  console.log("closed");
  console.log(arguments);
  process.stdin.end();
})
