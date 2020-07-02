/**
 * Module that registers the simple room functionality
 */
var Position = {
	fire:null,
	temperature:null,
	buttons:{},
	
	name: "Room",
	init: function(options) {
		this.options = $.extend(
			this.options,
			options
		);
		
		if(Engine._debug) {
		}
		
		if(typeof $SM.get('features.location.room') == 'undefined') {
			$SM.set('features.location.room', true);
			$SM.set('game.builder.level', -1);
		}
		
		Room.temperature = this.TempEnum.Cold;
		Room.fire = this.FireEnum.Dead;
		
		
		// Create the room tab
		this.tab = Header.addLocation("제1재판정", "jae1", Position);
		
		// Create the Room panel
		this.panel = $('<div>')
			.attr('id', "posPanel")
			.addClass('location')
			.appendTo('div#locationSlider');
		
		Engine.updateSlider();
		
		// Create the light button
		new Button.Button({
			id: 'lightButton',
			text: 'light fire',
			click: Room.lightFire,
			cooldown: Room._STOKE_COOLDOWN,
			width: '80px',
			cost: {'wood': 5}
		}).appendTo('div#roomPanel');
		
		// Create the stoke button
		new Button.Button({
			id: 'stokeButton',
			text: "stoke fire",
			click: Room.stokeFire,
			cooldown: Room._STOKE_COOLDOWN,
			width: '80px',
			cost: {'wood': 1}
		}).appendTo('div#roomPanel');
		
		// Create the stores container
		$('<div>').attr('id', 'storesContainer').appendTo('div#roomPanel');
		
		//subscribe to stateUpdates
		$.Dispatch('stateUpdate').subscribe(Room.handleStateUpdates);
		
		Room.updateButton();
		Room.updateStoresView();
		Room.updateIncomeView();
		Room.updateBuildButtons();
		
		Room._fireTimer = setTimeout(Room.coolFire, Room._FIRE_COOL_DELAY);
		Room._tempTimer = setTimeout(Room.adjustTemp, Room._ROOM_WARM_DELAY);
		
		/*
		 * Builder states:
		 * 0 - Approaching
		 * 1 - Collapsed
		 * 2 - Shivering
		 * 3 - Sleeping
		 * 4 - Helping
		 */
		if($SM.get('game.builder.level') >= 0 && $SM.get('game.builder.level') < 3) {
			Room._builderTimer = setTimeout(Room.updateBuilderState, Room._BUILDER_STATE_DELAY);
		}
		if($SM.get('game.builder.level') == 1 && $SM.get('stores.wood', true) < 0) {
			setTimeout(Room.unlockForest, Room._NEED_WOOD_DELAY);
		}
		setTimeout($SM.collectIncome, 1000);
		
		Notifications.notify(Room, "the room is " + Room.temperature.text);
		Notifications.notify(Room, "the fire is " + Room.fire.text);
	},
	
	options: {}, // Nothing for now
	
	onArrival: function(transition_diff) {
		Room.setTitle();
		if(Room.changed) {
			Notifications.notify(Room, "the fire is " + Room.fire.text);
			Notifications.notify(Room, "the room is " + Room.temperature.text);
			Room.changed = false;
		}
		if($SM.get('game.builder.level') == 3) {
			$SM.add('game.builder.level', 1);
			$SM.setIncome('builder', {
				delay: 10,
				stores: {'wood' : 2 }
			});
			Room.updateIncomeView();
			Notifications.notify(Room, "the stranger is standing by the fire. she says she can help. says she builds things.");
		}

		Engine.moveStoresView(null, transition_diff);
	},
	
	TempEnum: {
		fromInt: function(value) {
			for(var k in this) {
				if(typeof this[k].value != 'undefined' && this[k].value == value) {
					return this[k];
				}
			}
			return null;
		},
		Freezing: { value: 0, text: 'freezing' },
		Cold: { value: 1, text: 'cold' },
		Mild: { value: 2, text: 'mild' },
		Warm: { value: 3, text: 'warm' },
		Hot: { value: 4, text: 'hot' }
	},
	
	FireEnum: {
		fromInt: function(value) {
			for(var k in this) {
				if(typeof this[k].value != 'undefined' && this[k].value == value) {
					return this[k];
				}
			}
			return null;
		},
		Dead: { value: 0, text: 'dead' },
		Smoldering: { value: 1, text: 'smoldering' },
		Flickering: { value: 2, text: 'flickering' },
		Burning: { value: 3, text: 'burning' },
		Roaring: { value: 4, text: 'roaring' }
	},
	
	setTitle: function() {
		var title = Room.fire.value < 2 ? "A Dark Room" : "A Firelit Room";
		if(Engine.activeModule == this) {
			document.title = title;
		}
		$('div#location_room').text(title);
	},
	
	updateButton: function() {
		var light = $('#lightButton.button');
		var stoke = $('#stokeButton.button');
		if(Room.fire.value == Room.FireEnum.Dead.value && stoke.css('display') != 'none') {
			stoke.hide();
			light.show();
			if(stoke.hasClass('disabled')) {
				Button.cooldown(light);
			}
		} else if(light.css('display') != 'none') {
			stoke.show();
			light.hide();
			if(light.hasClass('disabled')) {
				Button.cooldown(stoke);
			}
		}
		
		if(!$SM.get('stores.wood')) {
			light.addClass('free');
			stoke.addClass('free');
		} else {
			light.removeClass('free');
			stoke.removeClass('free');
		}
	},
	
	_fireTimer: null,
	_tempTimer: null,
	lightFire: function() {
		var wood = $SM.get('stores.wood');
		if(wood < 5) {
			Notifications.notify(Room, "not enough wood to get the fire going");
			Button.clearCooldown($('#lightButton.button'));
			return;
		} else if(wood > 4) {
			$SM.set('stores.wood', wood - 5);
		}
		Room.fire = Room.FireEnum.Burning;
		Room.onFireChange();
	},
	
	stokeFire: function() {
		var wood = $SM.get('stores.wood');
		if(wood === 0) {
			Notifications.notify(Room, "the wood has run out");
			Button.clearCooldown($('#stokeButton.button'));
			return;
		}
		if(wood > 0) {
			$SM.set('stores.wood', wood - 1);
		}
		if(Room.fire.value < 4) {
			Room.fire = Room.FireEnum.fromInt(Room.fire.value + 1);
		}
		Room.onFireChange();
	},
	
	onFireChange: function() {
		if(Engine.activeModule != Room) {
			Room.changed = true;
		}
		Notifications.notify(Room, "the fire is " + Room.fire.text, true);
		if(Room.fire.value > 1 && $SM.get('game.builder.level') < 0) {
			$SM.set('game.builder.level', 0);
			Notifications.notify(Room, "the light from the fire spills from the windows, out into the dark");
			setTimeout(Room.updateBuilderState, Room._BUILDER_STATE_DELAY);
		}	
		window.clearTimeout(Room._fireTimer);
		Room._fireTimer = setTimeout(Room.coolFire, Room._FIRE_COOL_DELAY);
		Room.updateButton();
		Room.setTitle();
	},
	
	coolFire: function() {
		var wood = $SM.get('stores.wood');
		if(Room.fire.value <= Room.FireEnum.Flickering.value &&
			$SM.get('game.builder.level') > 3 && wood > 0) {
			Notifications.notify(Room, "builder stokes the fire", true);
			$SM.set('stores.wood', wood - 1);
			Room.fire = Room.FireEnum.fromInt(Room.fire.value + 1);
		}
		if(Room.fire.value > 0) {
			Room.fire = Room.FireEnum.fromInt(Room.fire.value - 1);
			Room._fireTimer = setTimeout(Room.coolFire, Room._FIRE_COOL_DELAY);
			Room.onFireChange();
		}
	},
	
	adjustTemp: function() {
		var old = Room.temperature.value;
		if(Room.temperature.value > 0 && Room.temperature.value > Room.fire.value) {
			Room.temperature = Room.TempEnum.fromInt(Room.temperature.value - 1);
			Notifications.notify(Room, "the room is " + Room.temperature.text, true);
		}
		if(Room.temperature.value < 4 && Room.temperature.value < Room.fire.value) {
			Room.temperature = Room.TempEnum.fromInt(Room.temperature.value + 1);
			Notifications.notify(Room, "the room is " + Room.temperature.text, true);
		}
		if(Room.temperature.value != old) {
			Room.changed = true;
		}
		Room._tempTimer = setTimeout(Room.adjustTemp, Room._ROOM_WARM_DELAY);
	},
	
	unlockForest: function() {
		$SM.set('stores.wood', 4);
		Outside.init();
		Notifications.notify(Room, "the wind howls outside");
		Notifications.notify(Room, "the wood is running out");
		Engine.event('progress', 'outside');
	},
	
	updateBuilderState: function() {
		var lBuilder = $SM.get('game.builder.level');
		if(lBuilder == 0) {
			Notifications.notify(Room, "a ragged stranger stumbles through the door and collapses in the corner");
			lBuilder = $SM.setget('game.builder.level', 1);
			setTimeout(Room.unlockForest, Room._NEED_WOOD_DELAY);
		} 
		else if(lBuilder < 3 && Room.temperature.value >= Room.TempEnum.Warm.value) {
			var msg = "";
			switch(lBuilder) {
			case 1:
				msg = "the stranger shivers, and mumbles quietly. her words are unintelligible.";
				break;
			case 2:
				msg = "the stranger in the corner stops shivering. her breathing calms.";
				break;
			}
			Notifications.notify(Room, msg);
			if(lBuilder < 3) {
				lBuilder = $SM.setget('game.builder.level', lBuilder + 1);
			}
		}
		if(lBuilder < 3) {
			setTimeout(Room.updateBuilderState, Room._BUILDER_STATE_DELAY);
		}
		Engine.saveGame();
	},
	
	updateStoresView: function() {
		var stores = $('div#stores');
		var weapons = $('div#weapons');
		var needsAppend = false, wNeedsAppend = false, newRow = false;
		if(stores.length == 0) {
			stores = $('<div>').attr({
				id: 'stores'
			}).css('opacity', 0);
			needsAppend = true;
		}
		if(weapons.length == 0) {
			weapons = $('<div>').attr({
				id: 'weapons'
			}).css('opacity', 0);
			wNeedsAppend = true;
		}
		for(var k in $SM.get('stores')) {
			
			var type = null;
			if(Room.Craftables[k]) {
				type = Room.Craftables[k].type;
			} else if(Room.TradeGoods[k]) {
				type = Room.TradeGoods[k].type;
			} else if (Room.MiscItems[k]) {
			  type = Room.MiscItems[k].type;
			}
			
			var location;
			switch(type) {
			case 'upgrade':
				// Don't display upgrades on the Room screen
				continue;
			case 'weapon':
				location = weapons;
				break;
			default:
				location = stores;
				break;
			}
			
			var id = "row_" + k.replace(' ', '-');
			var row = $('div#' + id, location);
			var num = $SM.get('stores["'+k+'"]');
			
			if(typeof num != 'number' || isNaN(num)) {
				// No idea how counts get corrupted, but I have reason to believe that they occassionally do.
				// Build a little fence around it!
				num = 0;
				$SM.set('stores["'+k+'"]', 0);
			}
			
			
			// thieves?
			if(typeof $SM.get('game.thieves') == 'undefined' && num > 5000 && $SM.get('features.location.world')) {
				$SM.startThieves();
			}
			
			if(row.length == 0 && num > 0) {
				row = $('<div>').attr('id', id).addClass('storeRow');
				$('<div>').addClass('row_key').text(k).appendTo(row);
				$('<div>').addClass('row_val').text(Math.floor(num)).appendTo(row);
				$('<div>').addClass('clear').appendTo(row);
				var curPrev = null;
				location.children().each(function(i) {
					var child = $(this);
					var cName = child.attr('id').substring(4).replace('-', ' ');
					if(cName < k && (curPrev == null || cName > curPrev)) {
						curPrev = cName;
					}
				});
				if(curPrev == null) {
					row.prependTo(location);
				} else {
					row.insertAfter(location.find('#row_' + curPrev.replace(' ', '-')));
				}
				newRow = true;
			} else if(num>= 0){
				$('div#' + row.attr('id') + ' > div.row_val', location).text(Math.floor(num));
			}
		}
		
		if(needsAppend && stores.children().length > 0) {
			stores.appendTo('div#storesContainer');
			stores.animate({opacity: 1}, 300, 'linear');
		}
		
		if(wNeedsAppend && weapons.children().length > 0) {
			weapons.appendTo('div#storesContainer');
			weapons.animate({opacity: 1}, 300, 'linear');
		}
		
		if(newRow) {
			Room.updateIncomeView();
		}

		if($("div#outsidePanel").length) {
			Outside.updateVillage();
		}
	},
	
	updateIncomeView: function() {
		var stores = $('div#stores');
		if(stores.length == 0 || typeof $SM.get('income') == 'undefined') return;
		$('div.storeRow', stores).each(function(index, el) {
			el = $(el);
			$('div.tooltip', el).remove();
			var tt = $('<div>').addClass('tooltip bottom right');
			var storeName = el.attr('id').substring(4).replace('-', ' ');
			for(var incomeSource in $SM.get('income')) {
				var income = $SM.get('income["'+incomeSource+'"]');
				for(var store in income.stores) {
					if(store == storeName && income.stores[store] != 0) {
						$('<div>').addClass('row_key').text(incomeSource).appendTo(tt);
						$('<div>')
							.addClass('row_val')
							.text(Engine.getIncomeMsg(income.stores[store], income.delay))
							.appendTo(tt);
					}
				}
			}
			if(tt.children().length > 0) {
				tt.appendTo(el);
			}
		});
	},
	
	buy: function(buyBtn) {
		var thing = $(buyBtn).attr('buildThing');
		var good = Room.TradeGoods[thing];
		var numThings = $SM.get('stores["'+thing+'"]', true);
		if(numThings < 0) numThings = 0;
		if(good.maximum <= numThings) {
			return;
		}
		
		var storeMod = {};
		var cost = good.cost();
		for(var k in cost) {
			var have = $SM.get('stores["'+k+'"]', true);
			if(have < cost[k]) {
				Notifications.notify(Room, "not enough " + k);
				return false;
			} else {
				storeMod[k] = have - cost[k];
			}
		}
		$SM.setM('stores', storeMod);
		
		Notifications.notify(Room, good.buildMsg);
		
		$SM.add('stores["'+thing+'"]', 1);
		
		if(thing == 'compass') {
			Path.openPath();
		}
	},
	
	build: function(buildBtn) {
		var thing = $(buildBtn).attr('buildThing');
		if(Room.temperature.value <= Room.TempEnum.Cold.value) {
			Notifications.notify(Room, "builder just shivers");
			return false;
		}
		var craftable = Room.Craftables[thing];
		
		var numThings = 0; 
		switch(craftable.type) {
		case 'good':
		case 'weapon':
		case 'tool':
		case 'upgrade':
			numThings = $SM.get('stores["'+thing+'"]', true);
			break;
		case 'building':
			numThings = $SM.get('game.buildings["'+thing+'"]', true);
			break;
		}
		
		if(numThings < 0) numThings = 0;
		if(craftable.maximum <= numThings) {
			return;
		}
		
		var storeMod = {};
		var cost = craftable.cost();
		for(var k in cost) {
			var have = $SM.get('stores["'+k+'"]', true);
			if(have < cost[k]) {
				Notifications.notify(Room, "not enough " + k);
				return false;
			} else {
				storeMod[k] = have - cost[k];
			}
		}
		$SM.setM('stores', storeMod);
		
		Notifications.notify(Room, craftable.buildMsg);
		
		switch(craftable.type) {
		case 'good':
		case 'weapon':
		case 'upgrade':
		case 'tool':
			$SM.add('stores["'+thing+'"]', 1);
			break;
		case 'building':
			$SM.add('game.buildings["'+thing+'"]', 1);
			break;
		}		
	},
	
	needsWorkshop: function(type) {
		return type == 'weapon' || type == 'upgrade' || type =='tool';
	},
	
	craftUnlocked: function(thing) {
		if(Room.buttons[thing]) {
			return true;
		}
		if($SM.get('game.builder.level') < 4) return false;
		var craftable = Room.Craftables[thing];
		if(Room.needsWorkshop(craftable.type) && $SM.get('game.buildings["workshop"]', true) == 0) return false;
		var cost = craftable.cost();
		
		//show button if one has already been built
		if($SM.get('game.buildings["'+thing+'"]') > 0){
			Room.buttons[thing] = true;
			return true;
		}
		// Show buttons if we have at least 1/2 the wood, and all other components have been seen.
		if($SM.get('stores.wood', true) < cost['wood'] * 0.5) {
			return false;
		}
		for(var c in cost) {
			if(!$SM.get('stores["'+c+'"]')) {
				return false;
			}
		}
		
		Room.buttons[thing] = true;
		//don't notify if it has already been built before
		if(!$SM.get('game.buildings["'+thing+'"]')){
			Notifications.notify(Room, craftable.availableMsg);
		}
		return true;
	},
	
	buyUnlocked: function(thing) {
		if(Room.buttons[thing]) {
			return true;
		} else if($SM.get('game.buildings["trading post"]', true) > 0) {
			if(thing == 'compass' || $SM.get('stores["'+thing+'"]')) {
				// Allow the purchase of stuff once you've seen it
				return true;
			}
		}
		return false;
	},
	
	updateBuildButtons: function() {
		var buildSection = $('#buildBtns');
		var needsAppend = false;
		if(buildSection.length == 0) {
			buildSection = $('<div>').attr('id', 'buildBtns').css('opacity', 0);
			needsAppend = true;
		}
		
		var craftSection = $('#craftBtns');
		var cNeedsAppend = false;
		if(craftSection.length == 0 && $SM.get('game.buildings["workshop"]', true) > 0) {
			craftSection = $('<div>').attr('id', 'craftBtns').css('opacity', 0);
			cNeedsAppend = true;
		}
		
		var buySection = $('#buyBtns');
		var bNeedsAppend = false;
		if(buySection.length == 0 && $SM.get('game.buildings["trading post"]', true) > 0) {
			buySection = $('<div>').attr('id', 'buyBtns').css('opacity', 0);
			bNeedsAppend = true;
		}
		
		for(var k in Room.Craftables) {
			craftable = Room.Craftables[k];
			var max = $SM.num(k, craftable) + 1 > craftable.maximum;
			if(craftable.button == null) {
				if(Room.craftUnlocked(k)) {
					var loc = Room.needsWorkshop(craftable.type) ? craftSection : buildSection;
					craftable.button = new Button.Button({
						id: 'build_' + k,
						cost: craftable.cost(),
						text: k,
						click: Room.build,
						width: '80px',
						ttPos: loc.children().length > 10 ? 'top right' : 'bottom right'
					}).css('opacity', 0).attr('buildThing', k).appendTo(loc).animate({opacity: 1}, 300, 'linear');
				}
			} else {
				// refresh the tooltip
				var costTooltip = $('.tooltip', craftable.button);
				costTooltip.empty();
				var cost = craftable.cost();
				for(var k in cost) {
					$("<div>").addClass('row_key').text(k).appendTo(costTooltip);
					$("<div>").addClass('row_val').text(cost[k]).appendTo(costTooltip);
				}
				if(max && !craftable.button.hasClass('disabled')) {
					Notifications.notify(Room, craftable.maxMsg);
				}
			}
			if(max) {
				Button.setDisabled(craftable.button, true);
			} else {
				Button.setDisabled(craftable.button, false);
			}
		}
		
		for(var k in Room.TradeGoods) {
			good = Room.TradeGoods[k];
			var max = $SM.num(k, good) + 1 > good.maximum;
			if(good.button == null) {
				if(Room.buyUnlocked(k)) {
					good.button = new Button.Button({
						id: 'build_' + k,
						cost: good.cost(),
						text: k,
						click: Room.buy,
						width: '80px'
					}).css('opacity', 0).attr('buildThing', k).appendTo(buySection).animate({opacity:1}, 300, 'linear');
				}
			} else {
				// refresh the tooltip
				var costTooltip = $('.tooltip', good.button);
				costTooltip.empty();
				var cost = good.cost();
				for(var k in cost) {
					$("<div>").addClass('row_key').text(k).appendTo(costTooltip);
					$("<div>").addClass('row_val').text(cost[k]).appendTo(costTooltip);
				}
				if(max && !good.button.hasClass('disabled')) {
					Notifications.notify(Room, good.maxMsg);
				}
			}
			if(max) {
				Button.setDisabled(good.button, true);
			} else {
				Button.setDisabled(good.button, false);
			}
		}
		
		if(needsAppend && buildSection.children().length > 0) {
			buildSection.appendTo('div#roomPanel').animate({opacity: 1}, 300, 'linear');
		}
		if(cNeedsAppend && craftSection.children().length > 0) {
			craftSection.appendTo('div#roomPanel').animate({opacity: 1}, 300, 'linear');
		}
		if(bNeedsAppend && buildSection.children().length > 0) {
			buySection.appendTo('div#roomPanel').animate({opacity: 1}, 300, 'linear');
		}
	},
	
	handleStateUpdates: function(e){
		if(e.category == 'stores'){
			Room.updateStoresView();
			Room.updateBuildButtons();
		} else if(e.category == 'income'){
			Room.updateStoresView();
			Room.updateIncomeView();
		} else if(e.stateName.indexOf('game.buildings') == 0){
			Room.updateBuildButtons();
		}
	}
};
