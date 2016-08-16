module.exports = function(grunt) {

  'use strict';

  // Project configuration
  grunt.initConfig({
    nodeunit: {
      all: [
        'tests/**/*.js',
        '!tests/utils.js',
        '!tests/integration/**/*.js'
      ]
    },
    jshint: {
      options: {
        jshintrc: true,
        ignores: [
          'node_modules/**'
        ]
      },
      all: [
        '**/*.js'
      ]
    },
    env: {
      test: {
        options: {
          add: {
            TEST_ENV: '1'
          }
        }
      },
      dev: {
        options: {
          replace: {
            TEST_ENV: ''
          }
        }
      }
    },
    exec: {
      deploy: {
        cmd: 'node server.js'
      }
    },
    mochaTest: {
      integration: {
        src: ['tests/integration/**/*.js'],
      },
    },
  });

  // Load the plugins
  grunt.loadNpmTasks('grunt-contrib-jshint');
  grunt.loadNpmTasks('grunt-contrib-nodeunit');
  grunt.loadNpmTasks('grunt-env');
  grunt.loadNpmTasks('grunt-exec');
  grunt.loadNpmTasks('grunt-mocha-test');

  // Default tasks
  grunt.registerTask('test', [
    'env:test',
    'jshint',
    'nodeunit',
    'test_integration',
    'env:dev'
  ]);

  grunt.registerTask('deploy', [
    'exec:deploy'
  ]);

  // Non-default tasks
  grunt.registerTask('test_integration', [
    'mochaTest:integration',
  ]);
};
