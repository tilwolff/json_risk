
(function(library){
        
        library.dcf=function(cf_obj, disc_curve, spread_curve, residual_spread, settlement_date){
                /*
                requires cf_obj of type
                {
                        date_pmt: array(date),
                        t_pmt: array(double),
                        pmt_total: aray(double)
                }
                
                */
                if (null===library.valuation_date) throw new Error("dcf: valuation_date must be set");
                //cuve initialisation and fallbacks
                var dc=library.get_initialised_curve(disc_curve);
                var sc=library.get_initialised_curve(spread_curve);
                if(typeof residual_spread !== "number") residual_spread=0;
                var sd=library.get_initialised_date(settlement_date);
                if (!sd) sd=library.valuation_date;

                //sanity checks
                if (undefined===cf_obj.t_pmt || undefined===cf_obj.pmt_total) throw new Error("dcf: invalid cashflow object");
                if (cf_obj.t_pmt.length !== cf_obj.pmt_total.length) throw new Error("dcf: invalid cashflow object");
                
                var res=0;
                var i=0;
                var df_d;
                var df_s;
                var df_residual;
                while(cf_obj.date_pmt[i]<=sd) i++;
                while (i<cf_obj.t_pmt.length){
                        df_d=library.get_df(dc,cf_obj.t_pmt[i]);
                        df_s=library.get_df(sc,cf_obj.t_pmt[i]);
                        df_residual=Math.exp(-cf_obj.t_pmt[i]*residual_spread);
                        res+=cf_obj.pmt_total[i]*df_d*df_s*df_residual;
                        i++;
                }
                return res;
        };

        library.simple_fixed_income=function(instrument){
                var maturity=library.get_initialised_date(instrument.maturity);       
                if(!maturity)
                        throw new Error("simple_fixed_income: must provide maturity date.");
                        
                if(typeof instrument.notional !== 'number')
                        throw new Error("simple_fixed_income: must provide valid notional.");
                this.notional=instrument.notional;
                
                if(typeof instrument.tenor !== 'number')
                        throw new Error("simple_fixed_income: must provide valid tenor.");
                
                if(instrument.tenor < 0 || instrument.tenor!==Math.floor(instrument.tenor))
                        throw new Error("simple_fixed_income: must provide valid tenor.");
                var tenor=instrument.tenor;
                
                this.type=(typeof instrument.type==='string') ? instrument.type : 'unknown';
                
                this.is_holiday_func=library.is_holiday_factory(instrument.calendar || "");
                this.year_fraction_func=library.year_fraction_factory(instrument.dcc || "");
                this.bdc=instrument.bdc || "";
                var effective_date=library.get_initialised_date(instrument.effective_date); //null allowed
                var first_date=library.get_initialised_date(instrument.first_date); //null allowed
                var next_to_last_date=library.get_initialised_date(instrument.next_to_last_date); //null allowed
                var settlement_days=(typeof instrument.settlement_days==='number') ? instrument.settlement_days: 0;
                this.settlement_date=library.adjust(library.add_days(library.valuation_date,
                                                                    settlement_days),
                                                                    "following",
                                                                    this.is_holiday_func);
                var residual_spread=(typeof instrument.residual_spread=='number') ? instrument.residual_spread : 0;
                var currency=instrument.currency || "";


                if(typeof instrument.fixed_rate === 'number'){
                        //fixed rate instrument
                        this.is_float=false;
                        this.fixed_rate=instrument.fixed_rate;
                }else{
                        //floating rate instrument
                        this.is_float=true;
                        this.float_spread=(typeof instrument.float_spread === 'number') ? instrument.float_spread : 0;
                        if(typeof instrument.current_rate !== 'number')
                                throw new Error("simple_fixed_income: must provide valid current_rate.");
                        this.current_rate=instrument.current_rate;
                }
                
                this.schedule=library.backward_schedule(effective_date, 
                                                 maturity,
                                                 tenor,
                                                 this.is_holiday_func,
                                                 this.bdc,
                                                 first_date,
                                                 next_to_last_date);

                this.cash_flows=this.fix_cash_flows(this.schedule,
                                                       this.bdc,
                                                       this.is_holiday_func,
                                                       this.year_fraction_func,
                                                       this.notional,
                                                       (this.is_float) ? this.current_rate : this.fixed_rate);
        };

        library.simple_fixed_income.prototype.fix_cash_flows=function(schedule, bdc, is_holiday_func, year_fraction_func, notional, rate ){
                if (null===library.valuation_date) throw new Error("fix_cash_flows: valuation_date must be set");

                var date_accrual_start=new Array(schedule.length-1);
                var date_accrual_end=new Array(schedule.length-1);
                var date_pmt=new Array(schedule.length-1);
                var t_accrual_start=new Array(schedule.length-1);
                var t_accrual_end=new Array(schedule.length-1);
                var t_pmt=new Array(schedule.length-1);
                var is_interest_date=new Array(schedule.length-1);
                var is_repay_date=new Array(schedule.length-1);
                var is_fixing_date=new Array(schedule.length-1);
                var is_condition_date=new Array(schedule.length-1);
                var current_principal=new Array(schedule.length-1);
                var interest_current_period=new Array(schedule.length-1);
                var accrued_interest=new Array(schedule.length-1);
                var pmt_principal=new Array(schedule.length-1);
                var pmt_interest=new Array(schedule.length-1);
                var pmt_total=new Array(schedule.length-1);
                
                var i;
                var adj=function(d){
                        return library.adjust(d,bdc,is_holiday_func);
                };
                var default_yf=library.year_fraction_factory(null);

                for(i=0;i<schedule.length-1;i++){
                        date_accrual_start[i]=schedule[i];
                        date_accrual_end[i]=schedule[i+1];
                        date_pmt[i]=adj(schedule[i+1]);
                        t_pmt[i]=default_yf(library.valuation_date,schedule[i+1]);
                        is_interest_date[i]=true;
                        is_repay_date[i]=false;
                        is_fixing_date[i]=false;
                        is_condition_date[i]=false;
                        current_principal[i]=notional;
                        interest_current_period[i]=notional*rate*year_fraction_func(date_accrual_start[i],date_accrual_end[i]);
                        accrued_interest[i]=interest_current_period[i];
                        pmt_principal[i]=0;
                        pmt_interest[i]=interest_current_period[i];
                        pmt_total[i]=pmt_interest[i];
                }
                pmt_total[schedule.length-2]+=notional;
                pmt_principal[schedule.length-2]+=notional;
                is_repay_date[schedule.length-2]=true;
                //returns cash flow table object
                return {date_accrual_start: date_accrual_start,
                        date_accrual_end: date_accrual_end,
                        date_pmt: date_pmt,
                        t_accrual_start: t_accrual_start,
                        t_accrual_end: t_accrual_end,
                        t_pmt: t_pmt,
                        is_interest_date: is_interest_date,
                        is_repay_date: is_repay_date,
                        is_fixing_date: is_fixing_date,
                        is_condition_date: is_condition_date,
                        current_principal: current_principal,
                        interest_current_period: interest_current_period,
                        accrued_interest: accrued_interest,
                        pmt_principal: pmt_principal,
                        pmt_interest: pmt_interest,
                        pmt_total: pmt_total
                };
                
        };
        
        library.simple_fixed_income.prototype.get_cash_flows=function(fwd_curve){
                if (!this.is_float) return this.cash_flows;
                
                //recalculate amounts for floater deals
                var c=this.cash_flows;
                var default_yf=library.year_fraction_factory(null);
                                
                var i, rt, interest, n=c.t_pmt.length;
                //start with i=1 as current rate does not need recalculating
                for(i=1;i<n;i++){
                       c.is_fixing_date[i]=true;
                       rt=library.get_fwd_rate(fwd_curve,
                                               default_yf(library.valuation_date,c.date_accrual_start[i]),
                                               default_yf(library.valuation_date,c.date_accrual_end[i]))+
                          this.float_spread;
                       
                       interest=this.notional*rt*
                                this.year_fraction_func(c.date_accrual_start[i],c.date_accrual_end[i]);
                       c.interest_current_period[i]=interest;
                       c.accrued_interest[i]=interest;
                       c.pmt_interest[i]=interest;
                }
                c.pmt_total[n-1]=c.pmt_interest[n-1]+this.notional;
                return c;
        };
        
        library.simple_fixed_income.prototype.present_value=function(disc_curve, spread_curve, fwd_curve){
                return library.dcf(this.get_cash_flows(fwd_curve || null),
                                   disc_curve,
                                   spread_curve,
                                   this.residual_spread,
                                   this.settlement_date);
        };
        
        library.pricer_bond=function(bond, disc_curve, spread_curve){
                var bond_internal=new library.simple_fixed_income(bond);
                return bond_internal.present_value(disc_curve, spread_curve, null);
        };
        
        library.pricer_floater=function(floater, disc_curve, spread_curve, fwd_curve){
                var floater_internal=new library.simple_fixed_income(floater);
                return floater_internal.present_value(disc_curve, spread_curve, fwd_curve);
        };
        
        library.pricer_swap=function(swap, disc_curve, fwd_curve){
                var fixed_sign=(swap.is_payer) ? -1 : 1;
                var fixed_leg_internal=new library.simple_fixed_income({
                        notional: swap.notional * fixed_sign,
                        maturity: swap.maturity,
                        fixed_rate: swap.fixed_rate,
                        tenor: swap.fixed_tenor,
                        effective_date: swap.effective_date,
                        calendar: swap.calendar,
                        bdc: swap.fixed_bdc,
                        dcc: swap.fixed_dcc
                });
                var float_leg_internal=new library.simple_fixed_income({
                        notional: - swap.notional * fixed_sign,
                        maturity: swap.maturity,
                        float_spread: swap.float_spread,
                        tenor: swap.float_tenor,
                        effective_date: swap.effective_date,
                        calendar: swap.calendar,
                        bdc: swap.float_bdc,
                        dcc: swap.float_dcc,
                        current_rate: swap.float_current_rate
                });

                return fixed_leg_internal.present_value(disc_curve, null, null)+
                       float_leg_internal.present_value(disc_curve, null, fwd_curve);
        };
        
        library.pricer_fxterm=function(fxterm, disc_curve){
                //first leg
                var first_leg_internal=new library.simple_fixed_income({
                        notional: fxterm.notional, // negative is first leg is pay leg
                        maturity: fxterm.maturity,
                        fixed_rate: 0,
                        tenor: 0
                });
                
                var pv=first_leg_internal.present_value(disc_curve, null, null);
                if (typeof(fxterm.notional_2) !== "number") return pv;
                //optional second leg
                var second_leg_internal=new library.simple_fixed_income({
                        notional: fxterm.notional_2, // negative if second leg is pay leg
                        maturity: fxterm.maturity_2,
                        fixed_rate: 0,
                        tenor: 0
                });

                return pv+second_leg_internal.present_value(disc_curve, null, null);
        };

}(this.JsonRisk || module.exports));
