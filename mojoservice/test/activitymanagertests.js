include("test/loadall.js");

var ActivityManagerTests = Class.create(
{
	testGetActivity: function()
	{
		var act1 = ActivityManager.getActivity();
		MojoTest.require(act1 != null, "Create a new activity");
		
		return MojoTest.passed;
	},
	
	testCompareActivities: function()
	{
		var act1 = ActivityManager.getActivity();
		var act2 = ActivityManager.getActivity();
		MojoTest.require(act1 !== act2, "Make sure we create two independent activities");
		var act3 = ActivityManager.getActivity(10);
		var act4 = ActivityManager.getActivity(10);
		MojoTest.require(act3 === act4, "Make sure we get the same activity for the same id");
		
		return MojoTest.passed;
	},
	
	testRefActivities: function()
	{
		var act1 = ActivityManager.getActivity();
		MojoTest.require(act1._refcount == 0, "New activity should have internal refcount of 0");
		act1.ref();
		MojoTest.require(act1._refcount == 1, "Ref-ed activity should have internal refcount of 1");
		act1.deref();
		MojoTest.require(act1._refcount == 0, "New activity should have internal refcount of 0");
		
		return MojoTest.passed;
	},
	
	testDerefActivities: function()
	{
		var act1 = ActivityManager.getActivity();
		try
		{
			act1.deref();
		}
		catch (e)
		{
			return MojoTest.passed;
		}
		return "Deref activity which was not referenced - should throw exception";
	},
});
