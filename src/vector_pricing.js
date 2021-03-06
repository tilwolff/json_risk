(function(library){



        /*
        
                JsonRisk vector pricing
                
                
        */
        
        var stored_params=null; //hidden variable for parameter storage

		/**
		 	* ...
			* @param {object} obj
			* @returns {number} scalar
			* @memberof library
			* @private
		*/           
        var normalise_scalar=function(obj){ //makes value an array of length one if it is not an array
                return (Array.isArray(obj.value)) ? {value: obj.value} : {value: [obj.value]};
        };

		/**
		 	* ...
			* @param {object} obj
			* @returns {object} curve
			* @memberof library
			* @private
		*/           
        var normalise_curve=function(obj){ // constructs times from days, dates or labels and makes dfs and zcs an array of length one if it is not an array
                return {
                        times: library.get_curve_times(obj),
                        dfs: obj.dfs ? ((Array.isArray(obj.dfs[0])) ? obj.dfs : [obj.dfs]) : null,
                        zcs: obj.zcs ? ((Array.isArray(obj.zcs[0])) ? obj.zcs : [obj.zcs]) : null
                };
        };


		/**
		 	* ...
			* @param {object} obj 
			* @returns {object} surface
			* @memberof library
			* @private
		*/           
        var normalise_surface=function(obj){ // constructs terms from labels_term, expiries from labels_expiry and makes value an array of length one if it is not an array
                var safe_surface=library.get_safe_surface(obj); //has terms and expiries
                return {
                        expiries: safe_surface.expiries,
                        terms: safe_surface.terms,
                        values: (Array.isArray(obj.values[0][0])) ? obj.values : [obj.values]
                };
        };


		/**
		 	* ...
			* @param {object} len length
			* @returns {number} ...
			* @memberof library
			* @private
		*/           
        var update_vector_length=function(len){
                if (1===len) return;
                if (1===stored_params.vector_length){
                        stored_params.vector_length = len;
                        return;
                }
                if (len !== stored_params.vector_length) throw new Error("vector_pricing: provided parameters need to have the same length or length one");
        };

		/**
		 	* ...
			* @param {object} params parameter
			* @memberof library
			* @public
		*/           
        library.store_params=function(params){
                stored_params={vector_length: 1,
			       scalars: {},
			       curves: {},
			       surfaces: {}
	        };

                var keys, i;
                //valuation date
                stored_params.valuation_date=library.get_safe_date(params.valuation_date);
                //scalars
                if (typeof(params.scalars) === 'object'){
                        keys=Object.keys(params.scalars);
                        for (i=0; i< keys.length;i++){
                                stored_params.scalars[keys[i]]=normalise_scalar(params.scalars[keys[i]]);
                                update_vector_length(stored_params.scalars[keys[i]].value.length);
                        }
                }
                //curves
                if (typeof(params.curves) === 'object'){
                        keys=Object.keys(params.curves);
                        var obj,len;
                        for (i=0; i< keys.length;i++){
                                obj=normalise_curve(params.curves[keys[i]]);
                                stored_params.curves[keys[i]]=obj;
                                len=obj.dfs ? obj.dfs.length : obj.zcs.length;
                                update_vector_length(len);
                        }
                }
                
                //surfaces
                if (typeof(params.surfaces) === 'object'){
                        keys=Object.keys(params.surfaces);
                        for (i=0; i< keys.length;i++){
                                stored_params.surfaces[keys[i]]=normalise_surface(params.surfaces[keys[i]]);
                                update_vector_length(stored_params.surfaces[keys[i]].values.length);
                        }
                }
        
        };

		/**
		 	* ...
			* @returns {object} parameter
			* @memberof library
			* @public
		*/           
        library.get_params=function(){
                return stored_params;
        };

		/**
		 	* ...
			* @param {object} params parameter
			* @returns {object} ...
			* @memberof library
			* @public
		*/   
        library.set_params=function(params){
		if (typeof(params) !== 'object') throw new Error("vector_pricing: try to hard set invalid parameters. Use store_params to normalize and store params.");
		if (typeof(params.vector_length) !== 'number') throw new Error("vector_pricing: try to hard set invalid parameters. Use store_params to normalize and store params.");
                stored_params=params;
        };
		/**
		 	* ...
			* @param {object} vec_curve
			* @param {object} i
			* @returns {object} curve
			* @memberof library
			* @private
		*/           
        var get_scalar_curve=function(vec_curve, i){
                if (!vec_curve) return null;
                return { times: vec_curve.times,
                        dfs: vec_curve.dfs ? (vec_curve.dfs[vec_curve.dfs.length>1 ? i : 0]) : null,
                        zcs: vec_curve.zcs ? (vec_curve.zcs[vec_curve.zcs.length>1 ? i : 0]) : null
                };
        };
		/**
		 	* ...
			* @param {object} vec_surface
			* @param {object} i
			* @returns {object} surface
			* @memberof library
			* @private
		*/         
        var get_scalar_surface=function(vec_surface, i){
                if (!vec_surface) return null;
                return { expiries: vec_surface.expiries,
                         terms: vec_surface.terms,
                         values: vec_surface.values[vec_surface.values.length>1 ? i : 0]
                };
        };

		/**
		 	* read instrument type for given instrument and create internal instrument
			* @param {object} instrument any instrument
			* @returns {object} internal instrument
			* @memberof library
			* @public
		*/           
        library.get_internal_object=function(instrument){
                switch (instrument.type.toLowerCase()){
                        case "bond":
                        case "floater":
			return new library.fixed_income(instrument);
                        case "swap":
                        return new library.swap(instrument);
                        case "swaption":
                        return new library.swaption(instrument);
                        case "fxterm":
                        return new library.fxterm(instrument);
                        case "callable_bond":
                        return new library.callable_fixed_income(instrument);
                        default:
                        throw new Error ("get_internal_object: invalid instrument type");
                }
        };
 
		/**
		 	* calculates the present value for any given supported instrument (bond, floater, fxterm, swap, swaption, callable_bond)
			* @param {object} instrument any instrument
			* @returns {number} present value
			* @memberof library
			* @public
		*/          
        library.vector_pricer=function(instrument){
                if (typeof(instrument.type)!== 'string') throw new Error ("vector_pricer: instrument object must contain valid type");
                library.valuation_date=stored_params.valuation_date;
                var obj=library.get_internal_object(instrument);
                var vec_dc=stored_params.curves[instrument.disc_curve || ""] || null;
                var vec_sc=stored_params.curves[instrument.spread_curve || ""] || null;
                var vec_fc=stored_params.curves[instrument.fwd_curve || ""] || null;
                var vec_surface=stored_params.surfaces[instrument.surface || ""] || null;
                var vec_fx=stored_params.scalars[instrument.currency || ""] || null;
                var dc, sc, fc, su, fx;
                var res=new Array(stored_params.vector_length);
                for (var i=0; i< stored_params.vector_length; i++){
                        dc=get_scalar_curve(vec_dc, i);
                        sc=get_scalar_curve(vec_sc, i);
                        fc=get_scalar_curve(vec_fc, i);
                        su=get_scalar_surface(vec_surface, i);
                        switch (instrument.type.toLowerCase()){
                                case "bond":
                                case "floater":
                                case "fxterm":
				                case "irregular_bond":
                                res[i]=obj.present_value(dc,sc,fc);
                                break;
                                case "swap":
                                case "swaption":
                                res[i]=obj.present_value(dc,fc,su);
				                break;
                                case "callable_bond":
                                res[i]=obj.present_value(dc,sc,fc,su);
                                break;
                        }
                        // if currency is provided and not EUR, convert or throw error
                        if (!instrument.currency) continue;
                        if (instrument.currency === 'EUR') continue;
                        if (!vec_fx) throw new Error ('vector_pricer: cannot convert currency, scalar parameter not provided');
                        res[i]/=vec_fx.value[vec_fx.value.length>1 ? i : 0];  
                }
                return res;
        };
        
}(this.JsonRisk || module.exports));
