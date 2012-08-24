/*global console, DB, Future, exports:true, Class, Transport, IO, PalmCall */

/*
 * Fetch the photos using this transport.
 */
exports.RefetchPhotoCommand = Class.create(Transport.Command,
{
    fetchPhoto: function (photo) {
        console.log("RefetchPhotoCommand: 'fetchPhoto' has not been implemented by the engine");
    },

    getKind: function () {
		throw new Error("No getKind function");
    },

    /*
     * Lookup the contact in the contact database
     * loop through the contact's photos searching for the specified photo
     * if the photo is found, fetch it to the filecache and update the localPath
     * merge the new path back into the contacts database
     * Arguments to this service call are:
            accountId: accountId,
            contactId: contactId,
            photoId: photoId
     */
	run: function (param)
	{
        var self = this,
            photo = null,
            photos = null,
            future = null,
            args = this.controller.args;

        if (!args.contactId || !args.photoId)
        {
            console.log("RefetchPhotoCommand: Missing required parameter: " + JSON.stringify(args));
            return new Future({});
        }

        console.log("RefetchPhotoCommand: searching for contactId: " + args.contactId);

        // get the contact using the contactId
		//TODO: make this a DB.get instead of a DB.find
        future = DB.find({
            from: this.getKind(),
            where: [ {"op": "=", "prop": "_id", "val": args.contactId} ]
        });

        future.then(function ()
        {
            var i,
                result = future.result;

            if (!result || !result.results || result.results.length === 0) 
            {
                throw new Error("RefetchPhotoCommand: no results searching for contact");
            }
            if (result.results.length > 1) 
            {
                throw new Error("RefetchPhotoCommand: too many results while searching for contact");
            }

            photos = result.results[0].photos;

            // get the specified photo from the photo array
            for (i = 0; i < photos.length; i++)
            {
                if (photos[i]._id === args.photoId)
                {
                    photo = photos[i];
                    console.log("RefetchPhotoCommand: Found desired photo = " + JSON.stringify(photo));
                    return self.fetchPhoto(photo);
                }
            }

            throw new Error("Did not find photo: " + args.photoId + " for contact: " + args.contactId);
        });

        future.then(function ()
        {
            photo.localPath = future.result;

            console.log("RefetchPhotoCommand: new photo path is: " + JSON.stringify(future.result));

            var query = {
                from: self.getKind(),
                where: [
                    {"op": "=", "prop": "_id", "val": args.contactId}
                ]
            };

            return DB.merge(query, {photos: photos});
        });

        future.then(function ()
        {
            try {
                console.log("RefetchPhotoCommand: DB merge returned: " + JSON.stringify(future.result));
                return future.result;
            } catch (e) {
                console.log("RefetchPhotoCommand: DB merge failed: " + e);
                throw e;
            }
        });

        param.result = future.result;
	}
});
