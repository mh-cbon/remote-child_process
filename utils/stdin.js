process.stdin.on('data', function (d) {
  process.stdout.write('stdout '+ d);
  process.stderr.write('stderr '+d);
  process.stdin.end();
})
