var inquirer = require('inquirer');

var question = {
  type: 'input',
  name: 'first_name',
  message: 'What\'s your first name'
};

inquirer.prompt([question]).then(function (answers) {
  console.log(answers);
});

process.stdin.on('data', console.error.bind(console))
