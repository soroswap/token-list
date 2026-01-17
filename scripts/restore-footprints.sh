#!/bin/bash
# Load environment variables from .env file and run restore-footprints

if [ ! -f .env ]; then
  echo "Error: .env file not found"
  echo "Please create a .env file in the project root (see .env.example)"
  exit 1
fi

# Export variables from .env file
set -a
source .env
set +a

# Run the restore-footprints script
yarn restore-footprints
