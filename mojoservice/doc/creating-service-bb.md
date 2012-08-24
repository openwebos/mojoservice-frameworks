# Creating Mojo Service BB Files

Integrating a new Mojo Service into the BitBake build system is as simple as integrating a new Mojo Application.  Much of the hard work of building a IPKG is handled using a common bitbake include file, which individual services **.bb** files can simply include.

### Hello World BB file

The **com.palm.service.helloworld.bb** file is very simple:

	DESCRIPTION = "HelloWorld Service"
	require common.inc

Both it, and the *common.inc* include file reside in SVN at:

	http://subversion.palm.com/main/nova/oe/trunk/palm/packages/mojo-services
	
By default, the source code for this service will reside in SVN at:

	http://subversion.palm.com/main/nova/palm/mojo-services/com.palm.service.helloworld
	
### What goes in the IPKG

The IPKG contains two major components:

1. The javascript and resources for the service.
2. The DBUS configuration file to auto-launch the service

The first of these is simply all the files in the submission for the service (or the directory referenced using the **S=** override).  The DBUS configuration is generated using the **services.json** file in the root directory of the service.

#### DBUS Configuration

Each service has a **services.json** file in its root directory which is used to define the services and commands implemented.  During the build process, these service names are extracted from the **services.json** file and the appropriate DBUS configuration is created and added to the IPKG.  Once the IPKG is installed on a device, any DBUS message send to one of these named services will result in the Mojo Service being launched (if it is not already running).
	
