pipeline {
  agent any

  options {
    disableConcurrentBuilds()
    skipDefaultCheckout(true)
    timestamps()
    timeout(time: 30, unit: 'MINUTES')
  }

  parameters {
    string(name: 'VERSION', defaultValue: '', trim: true, description: 'Immutable release version supplied by IDP')
  }

  stages {
    stage('Preflight') {
      steps {
        script {
          if (!params.VERSION?.trim()) {
            error('VERSION is required and must be supplied by IDP.')
          }
        }
        bat 'node --version'
        bat 'npm --version'
        bat 'git --version'
        bat 'tar --version'
      }
    }

    stage('Checkout') {
      steps {
        deleteDir()
        dir('source-backend') {
          checkout scm
        }
        dir('source-frontend') {
          git branch: 'main', url: 'https://github.com/brskcygt/IDP-Demo-Frontend.git'
        }
        script {
          env.RELEASE_COMMIT = bat(returnStdout: true, script: '@git -C source-backend rev-parse HEAD').trim()
        }
      }
    }

    stage('Test') {
      steps {
        powershell '''
          $ErrorActionPreference = 'Stop'
          Push-Location source-backend
          & npm.cmd test
          if ($LASTEXITCODE -ne 0) { throw "Backend tests failed with exit code $LASTEXITCODE." }
          Pop-Location

          Push-Location source-frontend
          & npm.cmd test
          if ($LASTEXITCODE -ne 0) { throw "Frontend tests failed with exit code $LASTEXITCODE." }
          Pop-Location
        '''
      }
    }

    stage('Package') {
      steps {
        powershell '''
          $ErrorActionPreference = 'Stop'
          if (Test-Path artifacts) { Remove-Item artifacts -Recurse -Force }
          New-Item -ItemType Directory -Force artifacts | Out-Null

          & node source-backend/scripts/stamp-version.js $env:VERSION source-backend source-frontend
          if ($LASTEXITCODE -ne 0) { throw "Version stamping failed with exit code $LASTEXITCODE." }

          & tar -czf "artifacts/idp-demo-backend-$env:VERSION-win-x64.tar.gz" -C source-backend server.js package.json version.json ops .env.example
          if ($LASTEXITCODE -ne 0) { throw "Backend packaging failed with exit code $LASTEXITCODE." }

          & tar -czf "artifacts/idp-demo-frontend-$env:VERSION.tar.gz" -C source-frontend index.html styles.css app.js config.js version.json web.config .env.example
          if ($LASTEXITCODE -ne 0) { throw "Frontend packaging failed with exit code $LASTEXITCODE." }
        '''
      }
    }

    stage('Publish to IDP') {
      steps {
        withCredentials([string(credentialsId: 'idp-artifact-upload-token', variable: 'IDP_ARTIFACT_UPLOAD_TOKEN')]) {
          powershell '''
            $ErrorActionPreference = 'Stop'
            if ([string]::IsNullOrWhiteSpace($env:IDP_URL)) { throw 'Jenkins environment variable IDP_URL is missing.' }
            if ([string]::IsNullOrWhiteSpace($env:IDP_PROJECT_ID)) { throw 'Jenkins environment variable IDP_PROJECT_ID is missing.' }
            if ([string]::IsNullOrWhiteSpace($env:IDP_ARTIFACT_UPLOAD_TOKEN)) { throw 'Jenkins credential idp-artifact-upload-token is missing.' }

            & node source-backend/scripts/make-manifest.js idp-demo $env:VERSION $env:RELEASE_COMMIT `
              "backend:win-x64:artifacts/idp-demo-backend-$env:VERSION-win-x64.tar.gz" `
              "frontend:any:artifacts/idp-demo-frontend-$env:VERSION.tar.gz"
            if ($LASTEXITCODE -ne 0) { throw "Manifest creation failed with exit code $LASTEXITCODE." }

            Move-Item "idp-demo-$env:VERSION-manifest.json" artifacts/
            & node source-backend/scripts/upload-artifacts.js `
              --project-id $env:IDP_PROJECT_ID `
              --version $env:VERSION `
              --manifest "artifacts/idp-demo-$env:VERSION-manifest.json" `
              --allow-http
            if ($LASTEXITCODE -ne 0) { throw "IDP artifact upload failed with exit code $LASTEXITCODE." }
          '''
        }
      }
    }
  }

  post {
    success {
      archiveArtifacts artifacts: 'artifacts/*', fingerprint: true
    }
    cleanup {
      deleteDir()
    }
  }
}
