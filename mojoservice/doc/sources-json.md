The *sources.json* file defines what files and libraries are loaded during service boot.  An typical file might look as follows:

{code:javascript}
[
  { "override": { "name": "mojoservice", trunk: true } },
  { "library": { "name": "foundations", version: "1.0" } },
  { "source": "helloworld.js" }
]
{code}

Three types of entries are currently understood:

* *override* specifies a specific version of a library to load.  This overrides the version specified both in this file and by other uses of the MojoLoader.
* *library* specifies a library name/version to load.
* *source* specifies a javascript file to load.  The file is located in the javascript/ subdirectory for this service.