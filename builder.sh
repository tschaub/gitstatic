#!/bin/bash
set -e

#
# Display usage
#
usage() {
  cat <<-EOF

  Usage: $0 <name> <repo_url> <commit_sha> <clones_root> <static_root>

  Arguments:

    name                  The name of the site
    repo_url              The git repository URL
    commit_sha            The commit to build
    clones_root           The root directory for repo clones
    static_root           The root directory for static sites

EOF
  exit 1
}

#
# Print an error message and exit
#
abort() {
  cat <<< "$@" 1>&2
  exit 1
}

if test $# -ne 5; then
  usage
fi

NAME=$1
REPO_URL=$2
COMMIT_SHA=$3
CLONES_ROOT=$4
STATIC_ROOT=$5

CLONE=$CLONES_ROOT/$NAME
TGZ=$CLONE/$NAME.tgz
SITE_DIR=$STATIC_ROOT/$NAME/

mkdir -p $STATIC_ROOT
mkdir -p $CLONES_ROOT

if [ ! -d $CLONE ]; then
  git clone --quiet $REPO_URL $CLONE
fi

pushd $CLONE 1>/dev/null
git fetch --quiet origin
git reset --quiet --hard $COMMIT_SHA
make
popd 1>/dev/null

if [ ! -f $TGZ ]; then
  abort "Make did not generate expected archive: $TGZ"
fi

TMP_DIR=`mktemp -d 2>/dev/null || mktemp -d -t $NAME`
tar xzf $TGZ -C $TMP_DIR

rsync --recursive --update --delete --perms --extended-attributes \
    $TMP_DIR/* $SITE_DIR 1>/dev/null
