class UCHN {

	constructor(datOrVal, valOrDat) {

		this.uid = Math.random()
		.toString(36)
		.slice(
			2,
			6
		)
		.toUpperCase();

		this.who = this.constructor.name;
		this.val = [];
		this.dat = {}; 
		this.mod = "vals";
		this.snc = "full";

		this.prv = null;
		this.nxt = null;

		this.sbc = 0;

		if(datOrVal) {

			if(Array.isArray(datOrVal)) 
				this.val = datOrVal;
			else 
				this.dat = datOrVal;
			
			if(valOrDat) {

				if(Array.isArray(valOrDat)) 
					this.val = valOrDat;
				else 
					this.dat = valOrDat;
			
			}
		
		}
	
	}

	get sub() {

		this.sbc++;

		return UCHN.chain(this); 

	}

	mode(mod) {

		this.mod = mod;

		return this; 

	}

	sync(snc) {

		this.snc = snc;

		return this; 

	}

	swap(TargetChain, ...args) {

		if(!TargetChain) {

			// if(!this.nxt) return this;

			const dst = this.nxt;

			// or no check and let it fail ?

			if(!dst) 
				UCHN.fail("no next");

			UCHN.sync(
				this,
				"->", 
				dst
			);
				
			return dst;
		
		}
		
		const dst = new TargetChain.baseClass(...args);

		dst.prv = this;
		this.nxt = dst;

		UCHN.sync(
			this,
			"->",
			dst,
			true
		);

		return dst;
	
	}
	
	get back() {

		const dst = this.prv;

		// if(!dst) return this;
		if(!dst) 
			UCHN.fail("no prev");

		UCHN.sync(
			this,
			"<-", 
			dst
		);

		return dst;
	
	}

	static from(ClassRef) {

		// old school function to allow "new" Chain
		const factory = function (...args) {

			return UCHN.chain(new ClassRef(...args));
		
		};

		factory.baseClass = ClassRef;
		
		return new Proxy(
			factory,
			{
				construct: (_, args) => 
					UCHN.chain(new ClassRef(...args)),
				get: (_, prop) => 
					typeof ClassRef.prototype[prop] === "function" 
						? UCHN.chain(new ClassRef())[prop] 
						: Reflect.get(
							factory,
							prop
						)
			}
		);
	
	}

	static proc(cur, res) {

		if(UCHN.VERB && res !== undefined) 
			console.log(res);

		if(res !== undefined) 
			cur.val.push(res);

		return cur;
	
	}

	static chain(init) {

		const ctx = {
			cur: init,
			ops: []
		};

		const keep = new Map();
		
		const exec = async op => {

			try {

				const res = await op(ctx.cur);

				if(res instanceof UCHN) 
					ctx.cur = res;

				return ctx.cur;
			
			}
			catch(err) {

				throw err;

			}
		
		};
		
		const flush = async () => {

			if(!ctx.ops.length) 
				return ctx.cur;

			const ops = [...ctx.ops];

			ctx.ops = [];

			for(const op of ops) 
				await exec(op);

			return ctx.cur;
		
		};
		
		const callop = (prop, args = []) => 
			async cur => {

				if(!cur[prop] || typeof cur[prop] !== "function") 
					UCHN.fail("no method " + prop);

				const res = await cur[prop].apply(
					cur,
					args
				);

				if(res instanceof UCHN) 
					return res;
			
				return UCHN.proc(
					cur,
					res
				);

			};
		
		const chain = new Proxy(
			{},
			{
				get(_, prop) {

					switch(prop) {

						case "ext":
							return fn => {

								ctx.ops.push(async cur => {

									const res = await fn(cur);

									return UCHN.proc(
										cur,
										res
									);
						
								});

								return chain;
					
							};
						
						case "hold":
							ctx.ops.push(cur => {

								Object.defineProperty(
									cur,
									"free",
									{ 
										get: () => 
											UCHN.chain(cur),
										configurable: true
									}
								);

								return cur;
						
							});

							const sink = flush();

							return {
								then: sink.then.bind(sink),
								catch: sink.catch.bind(sink)
							};
					
						case "swap": 
							return new Proxy(
								function(TargetChain, ...args) {

									ctx.ops.push(cur => 
										!TargetChain 
											? cur.swap() 
											: cur.swap(
												TargetChain,
												...args
											));

									return chain;
					
								},
								{
									get: (_, nxt) => {

										ctx.ops.push(cur => 
											cur.swap());

										return chain[nxt];
						
									}
								}
							);
				
						case "back":
							ctx.ops.push(cur => 
								cur.back);

							return chain;
				
						case "then":
							return (enjoy, eject) => {

								const sink = flush()
								.then(cur => {

									if(cur.sbc) {

										cur.sbc--;

										return undefined; 

									}

									switch(cur.mod) {

										case "this":
											return cur;
										case "data":
											return cur.dat;
										case "last":
											return cur.val.at(-1);
										default:
											return cur.val;
							
									}
						
								});
						
								const prom = eject 
									? sink.then(
										enjoy,
										eject
									) 
									: sink.then(enjoy);
						
								const prms = ["then", "catch", "finally"];
							
								prms.forEach(ise => {

									const orig = prom[ise];

									prom[ise] = function(...args) {
									
										const res = orig.apply(
											this,
											ise === "finally" 
												? [() => 
													args[0](ctx.cur)] 
												: args
										);
									
										prms.forEach(m => 
											res[m] = prom[m]);

										return res;
								
									};
							
								});
						
								return prom;
					
							};

						case "catch":
							return caught => {

								flush()
								.catch(caught);

								return chain; 

							};

						case "finally":
							return fn => {

								flush()
								.finally(() => 
									fn(ctx.cur));

								return chain; 

							};
				
					}

					if(!keep.has(prop)) {

						keep.set(
							prop,
							new Proxy(
								function(){},
								{
									apply: (_, __, args) => {

										ctx.ops.push(callop(
											prop,
											args
										));

										return chain;
						
									},
									get: (_, nxt) => {

										ctx.ops.push(callop(prop));

										return chain[nxt];
						
									}
								}
							)
						);
				
					}
				
					return keep.get(prop);
			
				},
				apply: () => 
					chain
			}
		);
		
		return chain;
	
	}

	static sync(src, dir, dst, mrg = false) {

		if(UCHN.VERB) 
			console.log(
				"SWAP",
				src.who + (UCHN.UIDS ? ":" + src.uid : ""),
				dir,
				dst.who + (UCHN.UIDS ? ":" + dst.uid : "")
			);

		if(src.snc === "vals" || src.snc === "full") 
			dst.val = mrg ? [...src.val, ...dst.val] : [...src.val];

		if(src.snc === "data" || src.snc === "full") 
			dst.dat = mrg ? {...src.dat,
				...dst.dat} : {...src.dat};

		dst.mod = src.mod;
		dst.snc = src.snc;
	
	}

	static fail(err) {

		throw new Error(err);
	
	}

}

UCHN.VERB = true;
UCHN.UIDS = true;

const Unchain = UCHN;

if(typeof module !== "undefined" && module.exports) 
	module.exports = UCHN;