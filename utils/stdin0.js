process.stdin.on('data', function (d) {
  process.stdout.write('stdout '+ d + '\n');
  process.stderr.write('stderr '+d + '\n');
  // process.stdin.end();
})
