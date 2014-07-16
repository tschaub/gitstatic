#!/bin/bash
set -e

#
# Display usage
#
usage() {
  cat <<-EOF

  Usage: $0 <name> <repo_url> <commit_sha> <static_root>

  Arguments:

    name                  The name of the site
    repo_url              The git repository URL
    commit_sha            The commit to build
    static_root           The static root

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

if test $# -ne 4; then
  usage
fi

NAME=$1
REPO_URL=$2
COMMIT_SHA=$3
STATIC_ROOT=$4

if [ ! -d $STATIC_ROOT ]; then
  abort "The static_root dir does not exist: $STATIC_ROOT"
fi

CLONE=repos/$NAME
TGZ=$CLONE/$NAME.tgz
SITE_DIR=$STATIC_ROOT/$NAME/

mkdir -p repos
if [ ! -d repos/$NAME ]; then
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

TMP_DIR=`mktemp -d 2>/dev/null || mktemp -d -t $NAME`/
tar xzf $TGZ -C $TMP_DIR

rsync --recursive --update --delete --perms --extended-attributes \
    $TMP_DIR $SITE_DIR 1>/dev/null
