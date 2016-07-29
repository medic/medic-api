module.exports = function(grunt) {

  'use strict';

  // Project configuration
  grunt.initConfig({
    nodeunit: {
      all: [
        'tests/unit/**/*.js',
        '!tests/**/utils.js'
      ]
    },
    jshint: {
      options: {
        jshintrc: true,
        ignores: [
          'node_modules/**',
          'medic-webapp/**'
        ]
      },
      all: [
        '**/*.js'
      ]
    },
    mochaTest: {
      integration: {
        src: ['tests/integration/**/*.js'],
      },
    },
    env: {
      unit_test: {
        options: {
          add: {
            UNIT_TEST: '1'
          }
        }
      },
      integration_test: {
        options: {
          replace: {
            UNIT_TEST: ''
          },
        }
      },
      dev: {
        options: {
          replace: {
            UNIT_TEST: ''
          }
        }
      }
    },
    exec: {
      deploy: {
        cmd: 'node server.js'
      }
    }
  });

  // Load the plugins
  grunt.loadNpmTasks('grunt-contrib-jshint');
  grunt.loadNpmTasks('grunt-contrib-nodeunit');
  grunt.loadNpmTasks('grunt-env');
  grunt.loadNpmTasks('grunt-exec');
  grunt.loadNpmTasks('grunt-mocha-test');

  // Default tasks
  grunt.registerTask('test', [
    'jshint',
    'integration_test', // run before unit tests to avoid polution
    'unit_test',
  ]);

  // Default tasks
  grunt.registerTask('unit_test', [
    'env:unit_test',
    'nodeunit',
    'env:dev'
  ]);

  // Default tasks
  grunt.registerTask('integration_test', [
    'env:integration_test',
    // TODO need to make sure that ddoc is up-to-date and client-ddoc is split
    'mochaTest:integration',
    'env:dev'
  ]);

  grunt.registerTask('deploy', [
    'exec:deploy'
  ]);
};
